# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DataQ Analyzer Frontend is a React SPA for visualizing Axis DataQ camera path and flow data. It provides real-time detection monitoring, heat mapping, and forensic search capabilities via WebSocket connections.

**Dev backend:** `dart.internal:3303`  
**Prod backend:** `bart.internal:3303` (served via Docker container on port 3303)

## Commands

```bash
npm run dev            # Start dev server (Vite, port 3303) — proxies /api and /ws to dart.internal:3303
npm run build          # Production build to dist/
npm run preview        # Preview production build locally
npm run lint           # Run ESLint on .js/.jsx files
npm run docker:build   # Build and tag Docker image (pandosme/dataq-frontend:latest)
npm run docker:push    # Push image to Docker Hub
npm run docker:run     # Run container locally on port 8303
npm run docker:stop    # Stop and remove container
```

No test framework is currently configured.

## Architecture

### Technology Stack
- React 19 with functional components and hooks
- Vite 7 build tool (with dev proxy to dart.internal)
- Axios for HTTP requests
- Pure React Context API for state (no Redux/Zustand)
- Canvas 2D API for heatmap visualizations

### Context Provider Hierarchy (main.jsx)
```
ServerProvider       → Multi-server management & selection (login-time only)
  └─ AuthProvider    → JWT auth state, login/logout, token storage
      └─ WebSocketProvider  → Real-time path event subscriptions
          └─ UserPreferencesProvider → User settings persistence
```

All contexts use localStorage for persistence. Provider order matters — inner providers depend on outer ones.

### Key Patterns

**Multi-Server Authentication**
- Users select a server URL at login (supports multiple backend deployments)
- JWT tokens stored per server in localStorage
- After login in Docker/nginx, all traffic is proxied via nginx — server URL is not needed at runtime
- In dev, "Local" server (empty URL = same-origin) is forwarded by the Vite proxy to `dart.internal:3303`
- 401 responses trigger automatic logout via Axios interceptor

**WebSocket Real-Time Updates**
- Connection URL: `/ws/paths?token=<JWT>` (token in query param, not header)
- Subscription model: `{ type: 'subscribe', cameras: [], filters: {} }`
- Reconnection with exponential backoff (max 10 attempts)
- 30-second keep-alive pings

**Dynamic API Configuration**
- `api.js` creates Axios instances dynamically based on the selected server URL
- Empty server URL ("Local") → relative `/api` base, proxied by Vite (dev) or nginx (prod)
- Explicit server URLs (e.g. `http://dart.internal:3303`) → direct requests

**Canvas Visualization Components**
- `FlowHeatmap.jsx`: Entry/exit points and paths overlay
- `DwellHeatmap.jsx`: Heat map of object dwell times
- `LiveData.jsx`: Real-time detections on video/snapshot
- All draw on canvas over camera snapshot images

### API Layer (src/services/api.js)
- `authAPI`: Login, current user
- `camerasAPI`: Camera list, details, snapshots
- `pathsAPI`: Query paths with MongoDB-style filters, stats aggregation
- `userPreferencesAPI`: User preferences CRUD
- `configAPI`: Server configuration
- `playbackAPI`: Video clip URL helpers (VideoX supported; ACS/Milestone stubs)
- `healthCheck`: Health endpoint

Query filters use MongoDB format sent to backend. Frontend converts dates to epoch milliseconds.

### Component Organization
- Feature-based: each major view (LiveData, FlowHeatmap, DwellHeatmap, ForensicSearch) is self-contained
- Component-scoped CSS files alongside JSX
- `ThreeColumnLayout.jsx` provides reusable layout structure
- `App.jsx` uses a shared `renderHeatmap(appId)` function for both Flow and Dwell heatmap views
- PropTypes for runtime prop validation

## Important Notes

- **React StrictMode is disabled** in main.jsx to prevent WebSocket double-mounting issues during development
- **Counters feature** is stubbed but disabled ("Coming soon")
- **minDistance filter** requires backend aggregation pipeline (not implemented)
- Direction filtering logic: `dy < 0` = "up", `dy >= 0` = "down"

## Environment Variables

No build-time env vars required. The Vite dev proxy and nginx runtime config handle backend routing automatically.

## Deployment

### Development
`npm run dev` starts Vite on port 3303. The built-in proxy forwards `/api` and `/ws` to `dart.internal:3303`, mirroring the production nginx setup.

### Production (Docker)
Multi-stage build:
1. Node 18 Alpine builds the React app
2. Nginx Alpine serves static files with SPA routing fallback
3. `BACKEND_URL` env var (e.g. `http://host.docker.internal:3303`) configures the nginx reverse proxy at container startup via `entrypoint.sh` + `nginx.conf.template`

Production docker-compose (bart.internal):
```yaml
services:
  dataq-frontend:
    image: pandosme/dataq-frontend:latest
    container_name: dataq-frontend
    ports:
      - "3303:80"
    environment:
      - BACKEND_URL=http://host.docker.internal:3303
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped
```
