# AGENTS.md — DataQ Analyzer Frontend: LLM Context Document

> **Read this first.** This document is written for AI coding agents / LLMs to understand the full system before making changes. Keep it up to date as the project evolves.

---

## 1. System Overview

DataQ Analyzer is a multi-service video analytics platform. Three repositories are always deployed together:

| Repo | Path | Purpose | Port |
|------|------|---------|------|
| `dataq-analyzer-frontend` | `/home/fred/development/dataq-analyzer-frontend` | React/Vite SPA — the UI you are in now | Vite dev: 5173 |
| `dataq-analyzer-backend` | `/home/fred/development/dataq-analyzer-backend` | Node.js/Express REST + WebSocket API | 3303 |
| `videox` | `/home/fred/development/videox` | Recording server (nginx + Node.js) | `http://videox.internal` |

The frontend **never** calls VideoX directly. All video and data requests go through the backend.

---

## 2. Architecture Diagram

```
Browser (React SPA)
  │
  ├── REST  →  dataq-analyzer-backend :3303  →  MongoDB :27017
  │                                           →  VideoX (http://videox.internal)
  │
  ├── WS /ws/paths?token=<jwt>   (live detection events)
  │
  └── WS /ws/video?token=<jwt>   (forensic video clip streaming)
```

---

## 3. Frontend Structure

```
src/
  App.jsx                     # Root: auth gate, app selection, camera selection, data loading
  main.jsx                    # Entry point — wraps with providers
  context/
    AuthContext.jsx            # JWT token, user, server URL — persisted in localStorage
    ServerContext.jsx          # Server list management
    UserPreferencesContext.jsx # dateFormat, timeFormat, videoPreTime, videoPostTime
    WebSocketContext.jsx       # Live path events WS (/ws/paths) with auto-reconnect
  components/
    Login.jsx                  # Server selector + credential form
    ThreeColumnLayout.jsx      # 300px left | 1fr middle | 350px right grid
    FilterPanel.jsx            # Left panel: time/class/direction filters, stats table
    CameraSelector.jsx         # Camera dropdown
    FlowHeatmap.jsx            # Middle: canvas paths overlay on camera snapshot
    DwellHeatmap.jsx           # Middle: heatmap overlay on camera snapshot
    ForensicSearch.jsx         # Middle: searchable detection table + WS video player
    Counters.jsx               # Middle: count charts
    LiveData.jsx               # Middle: real-time detection feed
    WebSocketVideoPlayer.jsx   # Video playback via /ws/video (MediaSource API)
    UserSettings.jsx           # Date format, time format, video pre/post time
  services/
    api.js                     # Axios wrapper — base URL set dynamically from AuthContext
  hooks/
    useContainerFit.js         # ResizeObserver hook: fills container preserving aspect ratio
  utils/
    dateFormat.js              # formatDateTime(ts, dateFormat, timeFormat)
```

### Application Tabs (selectedApplication state in App.jsx)
- `flow-heatmap` — paths drawn as lines on camera image
- `dwell-heatmap` — heat overlay based on dwell time
- `forensic-search` — searchable table of detections + video clips
- `counters` — count aggregations
- `live-view` — real-time WS feed

---

## 4. Backend Structure (`dataq-analyzer-backend`)

```
src/
  server.js              # Express app entry, mounts routes and WebSocket handlers
  routes/
    auth.js              # POST /api/auth/client-login → { data: { token, user } }
    cameras.js           # GET /api/cameras, GET /api/cameras/:serial/snapshot
    paths.js             # GET/POST /api/paths (query path events from MongoDB)
    config.js            # GET/PUT /api/config/system (system config incl. playback)
  websocket/
    pathHandlers.js      # /ws/paths — live detection push to subscribed clients
    videoHandlers.js     # /ws/video — forensic clip request/stream pipeline
  services/
    videoService.js      # getVideoClip(): calls VideoX, runs ffmpeg, returns Readable
    configService.js     # getSystemConfig(): reads MongoDB SystemConfig document
  models/
    PathEvent.js         # Mongoose model — detection events stored here
    SystemConfig.js      # Singleton config doc (id: "system-config")
```

### Key Backend Endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/auth/client-login` | None | `{ username, password }` → `{ data: { token } }` |
| GET | `/api/cameras` | Bearer JWT | Returns array with `serialNumber`, `name`, `labels` |
| GET | `/api/cameras/:serial/snapshot` | Bearer JWT | Returns base64 image |
| GET | `/api/paths` | Bearer JWT | Query params: `serial`, `limit`, `class`, `color`, `color2`, `direction`, `minDwell`, `minAge` |
| GET | `/api/config/system` | Bearer JWT | Returns `{ data: { playback: { enabled, type, serverUrl, apiKey, preTime, postTime }, ... } }` |
| PUT | `/api/config/system` | Bearer JWT | Body: `{ playback: { ... } }` (field is `playback`, NOT `playbackConfig`) |
| GET | `/api/health` | None | Returns `{ status, playback: { enabled, type, serverUrl, configured } }` |

---

## 5. Authentication Flow

1. User selects a server (URL) and enters credentials in `Login.jsx`
2. POST `/api/auth/client-login` with `{ username, password }`
3. Response: `response.data.token` (JWT) and `response.data.user`
4. Token + user + server stored in `localStorage` as `authToken`, `authUser`, `currentServer`
5. `AuthContext` rehydrates on page load from localStorage
6. All API calls send `Authorization: Bearer <token>` header
7. WebSocket connections append `?token=<jwt>` as query param

**Important:** The backend generates a random `JWT_SECRET` if the env var is not set. Restarting the backend with a new secret invalidates all existing tokens — users must re-login. The `JWT_SECRET` is now persisted in `/home/fred/development/dataq-analyzer-backend/.env`.

---

## 6. Live Path Events WebSocket (`/ws/paths`)

- Managed by `WebSocketContext.jsx`
- Auto-reconnects with exponential backoff (max 10 attempts)
- After connect, client sends: `{ type: "subscribe", cameras: ["<serial>"], filters: {} }`
- Backend pushes: `{ type: "path_event", data: <PathEvent> }`
- Used by `LiveData.jsx` and `Counters.jsx`

---

## 7. Forensic Video Playback WebSocket (`/ws/video`)

Sequence:
1. `ForensicSearch.jsx` row click → sets `videoInfo` state → renders `<WebSocketVideoPlayer>`
2. `WebSocketVideoPlayer` opens `ws://<server>/ws/video?token=<jwt>`
3. Sends: `{ type: "request_video", serial, timestamp, preTime, postTime, age, format: "mp4" }`
4. Backend `videoHandlers.js`:
   - Calls `videoService.getVideoClip(serial, timestamp, options)`
   - VideoX REST call: `GET /api/recordings/export-clip?serial=<>&start=<>&end=<>` with `Authorization: Bearer <apiKey>`
   - ffmpeg fragments the MP4 (required for MediaSource API streaming)
   - ffmpeg writes to temp file (avoids PassThrough race condition — see §10)
5. Backend sends:
   - `{ type: "video_metadata", duration, width, height, fps, codec, mimeType }`
   - Binary chunks (the fragmented MP4 bytes)
   - `{ type: "video_complete" }`
6. Frontend accumulates binary chunks → feeds into `MediaSource` → plays in `<video>` element

---

## 8. Path Event Data Model (MongoDB `pathevents` collection)

Key fields on a `PathEvent` document:

| Field | Type | Notes |
|-------|------|-------|
| `serial` | String | Camera serial number |
| `timestamp` | Date | When detection occurred (epoch ms or ISO from API) |
| `class` | String | `Car`, `Human`, `Truck`, `Bus`, `Bike`, `LicensePlate`, `Bag`, `Head`, `Animal`, `Vehicle`, `Other` |
| `color` | String | Primary color name: `Red`, `White`, `Black`, `Blue`, `Green`, `Yellow`, `Beige`, `Gray`, `Silver`, `Orange`, `Brown` |
| `color2` | String | Secondary color (optional, same value set as `color`) |
| `age` | Number | Track duration in seconds |
| `dwell` | Number | Dwell time in seconds |
| `dx` | Number | Horizontal displacement (positive = right) |
| `dy` | Number | Vertical displacement (positive = down) |
| `path` | Array | `[{ x, y }, ...]` — coordinates normalized 0–1000 |
| `anomaly` | String | Anomaly label if detected |

**Important field naming:** The color field is `color` (NOT `color1`). There is no `color1` field.

---

## 9. VideoX Service

- URL: `http://videox.internal` (nginx proxy, Node.js backend)
- Auth: `Authorization: Bearer <apiKey>` header — token looked up in MongoDB `ApiToken` collection (`active: true`, not expired)
- Clip endpoint: `GET /api/recordings/export-clip?serial=<>&start=<ISO>&end=<ISO>`
- Returns: `video/mp4` (returns HTML if URL has double slash — see §10)
- The API key is stored in the backend's `SystemConfig.playback.apiKey` (MongoDB) and can be overridden with `VIDEOX_API_KEY` env var

---

## 10. Known Issues Fixed / Pitfalls to Avoid

### Double-slash URL bug
`SystemConfig.playback.serverUrl` may have a trailing slash (e.g., `http://videox.internal/`). When combined with `/api/...` this produces `http://videox.internal//api/...`. nginx interprets `//api/...` as the frontend app root and returns HTML. `videoService.js` strips the trailing slash before constructing the URL.

### ffmpeg PassThrough race condition
The original code piped ffmpeg stdout to a `PassThrough` stream and returned it. ffmpeg completed and closed the stream before the caller attached a `data` listener, resulting in 0 bytes delivered. **Fix:** ffmpeg now writes to a temp output file; after the process exits, the file is read into a `Buffer` and returned as `Readable.from(buffer)`.

### JWT secret stability
Backend used to generate a random `JWT_SECRET` on each start. Now set in `/home/fred/development/dataq-analyzer-backend/.env`. If the backend is started without this file being sourced, all frontend sessions become invalid on restart.

### Config field naming (backend API)
- The system config REST field is `playback` (NOT `playbackConfig`)
- GET response structure: `response.data.data.playback` (note the double `.data`)
- PUT body should be: `{ "playback": { ... } }`

---

## 11. Environment Variables

### Frontend (`dataq-analyzer-frontend/.env`)
```
VITE_API_KEY=<videox-api-key>   # Optional: passed in WS video request as apiKey override
```

### Backend (`dataq-analyzer-backend/.env`)
```
NODE_ENV=development
PORT=3303
MONGODB_HOST=localhost
MONGODB_PORT=27017
MONGODB_DATABASE=dataq-analyzer
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
JWT_SECRET=<stable-secret>         # Must be set — random secret invalidates all sessions on restart
VIDEOX_API_KEY=<key>               # Fallback if DB config has no apiKey
```

---

## 12. Running the Stack

```bash
# Backend (from dataq-analyzer-backend/)
nodemon src/server.js
# or in background:
nohup nodemon src/server.js >> /tmp/dataq-backend.log 2>&1 &

# Frontend (from dataq-analyzer-frontend/)
npm run dev

# Test video WS end-to-end (from dataq-analyzer-backend/)
node test-video-ws.mjs [serial] [iso-timestamp]
```

---

## 13. UI Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Header: app tabs + camera selector + settings                   │
├───────────────┬───────────────────────────────┬──────────────────┤
│  Left Panel   │       Middle Panel            │   Right Panel    │
│  300px        │       flex: 1fr               │   350px          │
│               │                               │                  │
│  FilterPanel  │  FlowHeatmap /                │  Stats table     │
│  (filters,    │  DwellHeatmap /               │  (class counts,  │
│  class stats) │  ForensicSearch /             │   avg age, etc.) │
│               │  Counters /                   │                  │
│               │  LiveData                     │                  │
└───────────────┴───────────────────────────────┴──────────────────┘
```

`ThreeColumnLayout.jsx` uses CSS Grid: `300px 1fr 350px`. Middle panel has `overflow: auto`. Canvas components use `useContainerFit()` hook to size themselves to their container while preserving image aspect ratio.

---

## 14. Styling conventions

- Each component has a matching `.css` file imported directly
- Dark theme: `.dark-theme` class on `<body>` toggles dark styles (toggled via `UserSettings`)
- Color coding by object class is consistent across all components — see `getColorForClass()` in `FlowHeatmap.jsx` or `ForensicSearch.jsx`
- `box-sizing: border-box` is NOT set globally — components that use `width: 100%` with padding must set it themselves to avoid overflow

---

*Last updated: 2026-03-03 by GitHub Copilot (Claude Sonnet 4.6)*
