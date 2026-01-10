# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DataQ Analyzer Frontend is a React SPA for visualizing Axis DataQ camera path and flow data. It provides real-time detection monitoring, heat mapping, and forensic search capabilities via MQTT-based data and WebSocket connections.

## Commands

```bash
npm run dev          # Start dev server (Vite, port 3303)
npm run build        # Production build to dist/
npm run preview      # Preview production build locally
npm run lint         # Run ESLint on .js/.jsx files
npm run docker:build # Build Docker image (requires API_URL arg)
npm run docker:run   # Run container on port 80
npm run docker:stop  # Stop and remove container
```

No test framework is currently configured.

## Architecture

### Technology Stack
- React 19 with functional components and hooks
- Vite 7 build tool
- Axios for HTTP requests
- Pure React Context API for state (no Redux/Zustand)
- Canvas 2D API for heatmap visualizations

### Context Provider Hierarchy (main.jsx)
```
ServerProvider       → Multi-server management & selection
  └─ AuthProvider    → JWT auth state, login/logout, token storage
      └─ WebSocketProvider  → Real-time path event subscriptions
          └─ UserPreferencesProvider → User settings persistence
```

All contexts use localStorage for persistence. Provider order matters - inner providers depend on outer ones.

### Key Patterns

**Multi-Server Authentication**
- Users select a server before login (supports multiple backend deployments)
- JWT tokens stored per-server in localStorage
- 401 responses trigger automatic logout via Axios interceptor

**WebSocket Real-Time Updates**
- Connection URL: `/ws/paths?token=<JWT>` (token in query param, not header)
- Subscription model: `{ type: 'subscribe', cameras: [], filters: {} }`
- Reconnection with exponential backoff (max 10 attempts)
- 30-second keep-alive pings

**Dynamic API Configuration**
- API base URL set at build time via `VITE_API_URL` env var
- At runtime, selected server URL overrides the default
- Axios instances created lazily based on server selection

**Canvas Visualization Components**
- `FlowHeatmap.jsx`: Entry/exit points and paths overlay
- `DwellHeatmap.jsx`: Heat map of object dwell times
- `LiveData.jsx`: Real-time detections on video/snapshot
- All draw on canvas over camera snapshot images

### API Layer (src/services/api.js)
- `authAPI`: Login, logout, current user
- `camerasAPI`: Camera list, details, snapshots
- `pathsAPI`: Query paths with MongoDB-style filters, stats aggregation
- `usersAPI`: User preferences CRUD
- `configAPI`: Server configuration
- `healthAPI`: Health checks

Query filters use MongoDB format sent to backend. Frontend converts dates to epoch milliseconds.

### Component Organization
- Feature-based: each major view (LiveData, FlowHeatmap, ForensicSearch) is self-contained
- Component-scoped CSS files alongside JSX
- `ThreeColumnLayout.jsx` provides reusable layout structure
- PropTypes for runtime prop validation

## Important Notes

- **React StrictMode is disabled** in main.jsx to prevent WebSocket double-mounting issues during development
- **Counters feature** is stubbed but disabled ("Coming soon")
- **minDistance filter** requires backend aggregation pipeline (not implemented)
- Direction filtering logic: `dy < 0` = "up", `dy >= 0` = "down"

## Environment Variables

Only one env var is used (Vite prefix required for build-time substitution):
- `VITE_API_URL`: Backend API base URL (required for build)

## Deployment

Docker multi-stage build:
1. Node 18 Alpine builds the React app
2. Nginx Alpine serves static files with SPA routing fallback
3. API URL baked in at build: `--build-arg VITE_API_URL=<url>`
