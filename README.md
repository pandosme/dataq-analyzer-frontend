# DataQ Analyzer — Frontend

React/Vite SPA for visualizing and analyzing Axis camera detection data. Part of the DataQ Analyzer platform — works in conjunction with `dataq-analyzer-backend` (REST + WebSocket API) and `videox` (recording server).

## Quick Start

### Docker (Production)

```bash
docker run -d --name dataq-frontend -p 3303:80 --restart unless-stopped pandosme/dataq-frontend:latest
```

Or with docker-compose — see [deploy/](deploy/).

Open `http://<host>:3303`, select a backend server, and log in (default: `admin` / `admin`).

### Development

```bash
npm install
npm run dev
# Open http://localhost:5173
```

---

## Features

### Flow Heatmap
- Object movement paths drawn as color-coded lines on a camera snapshot
- Entry points (green) and exit points (red) overlaid per track
- Adjustable line transparency and time range filter
- Statistics panel: count and average age per class

### Dwell Heatmap
- Heat gradient overlay (blue → red) based on where objects spend time
- Adjustable minimum dwell threshold and opacity
- Supports area-of-interest (AOI) query filter

### Forensic Search
- Time range filter (3 hours up to 2 months)
- Object class, color (primary + secondary), direction, age, and dwell filters
- Draw entry / exit zones directly on the camera image
- Detection results table with color swatches and anomaly column
- **Video playback**: clicking a row streams the corresponding clip via WebSocket from the backend (VideoX integration)

### Counters
- Define 2–6 rectangular zones on a camera view
- Count objects moving between zones (e.g. Zone A → Zone B)
- Real-time updates as new path events arrive via WebSocket
- Historical backfill from existing path data
- Per-class breakdown and reset with timestamp tracking

### Live View
- Real-time detection feed via WebSocket (`/ws/paths`)
- Displays last N detections with class, color, age, and timestamp

---

## Architecture

```
Browser (React SPA)
  │
  ├── REST  →  dataq-analyzer-backend :3303  →  MongoDB
  │                                           →  VideoX (http://videox.internal)
  │
  ├── WS /ws/paths?token=<jwt>   (live detection events)
  │
  └── WS /ws/video?token=<jwt>   (forensic video clip streaming)
```

The frontend is a **static SPA served by nginx**. On the login screen users select which DataQ backend to connect to — all API and WebSocket traffic goes directly from the browser to that backend. No server-side proxy is needed.

For full architecture documentation including backend routes, data models, VideoX integration, and known pitfalls, see [AGENTS.md](AGENTS.md).

---

## Project Structure

```
src/
  App.jsx                     # Root: auth gate, tab selection, data loading
  main.jsx                    # Entry point with context providers
  components/
    CameraSelector.jsx
    Counters.jsx
    DwellHeatmap.jsx
    FilterPanel.jsx
    FlowHeatmap.jsx
    ForensicSearch.jsx
    LiveData.jsx
    Login.jsx
    ServerSelector.jsx
    ThreeColumnLayout.jsx     # 300px | 1fr | 350px CSS grid layout
    UserSettings.jsx
    WebSocketVideoPlayer.jsx  # MediaSource API video player over WS
  context/
    AuthContext.jsx            # JWT + server URL, persisted in localStorage
    ServerContext.jsx
    UserPreferencesContext.jsx
    WebSocketContext.jsx       # /ws/paths with auto-reconnect
  services/
    api.js                    # Axios wrapper with dynamic base URL
  hooks/
    useContainerFit.js        # ResizeObserver: fit canvas to container
  utils/
    dateFormat.js
docker/
  Dockerfile                  # Multi-stage build: node → nginx
deploy/
  docker-compose.yml
  README.md
AGENTS.md                     # Full system documentation for LLMs and developers
```

---

## Building the Docker Image

```bash
docker build -f docker/Dockerfile -t pandosme/dataq-frontend:latest .
docker push pandosme/dataq-frontend:latest
```

---

## Development Scripts

```bash
npm run dev       # Start dev server (port 5173)
npm run build     # Production build
npm run preview   # Preview production build
npm run lint      # Run ESLint
```

---

## License

MIT
