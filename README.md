# DataQ Analyzer — Frontend

React application for visualizing and analyzing Axis camera path and flow data.

## Features

- **Live Data** — Real-time path detection with live video or snapshots
- **Flow Heatmap** — Object movement paths with entry/exit points
- **Dwell Heatmap** — Heat map of where objects spend time
- **Counters** — Zone-based object counting with real-time updates and historical backfill
- **Forensic Search** — Advanced search with filters and video playback
- **User Settings** — Date format, theme, and display preferences

## Quick Start

### Docker (Production)

```bash
docker run -d --name dataq-frontend -p 3303:80 --restart unless-stopped pandosme/dataq-frontend:latest
```

Or with docker-compose — see [deploy/](deploy/).

Open `http://<host>:3303`, select a backend server, and log in (default: admin / admin).

### Development

```bash
npm install
npm run dev
# Open http://localhost:5173
```

## How It Works

The frontend is a static React SPA served by nginx. On the login screen, users add and select which DataQ backend server to connect to. All API and WebSocket traffic goes directly from the browser to the chosen backend — no server-side proxy is needed.

## Features

### Live Data (Detections)

- Live RTSP video (local cameras) or snapshot (remote cameras) with canvas overlay
- Real-time path visualization via WebSocket
- Configurable object class, distance, and age filters

### Flow Heatmap

- Entry points (green) and exit points (red) overlaid on camera snapshot
- Color-coded by object class
- Adjustable line transparency and time range
- Statistics panel with count and average age

### Dwell Heatmap

- Color gradient from blue (short dwell) to red (long dwell)
- Adjustable minimum dwell time and opacity
- Statistics for average dwell time per class

### Counters

- Define 2–6 rectangular zones on a camera view
- Automatically count objects moving between zones (e.g. Zone A → Zone B)
- Real-time updates as new path events arrive
- Historical backfill from existing path data
- Per-class breakdown (Human, Vehicle, etc.)
- Reset counters with timestamp tracking
- MQTT publishing support

### Forensic Search

- Time range selection (3 hours to 2 months)
- Object class and direction filters
- Entry/exit zone selection (draw on image)
- Age, dwell, and color filters
- Video playback integration
- Results table with anomaly detection

## Project Structure

```
src/
├── components/
│   ├── CameraSelector.jsx    # Camera picker
│   ├── Counters.jsx          # Zone-based counters
│   ├── DwellHeatmap.jsx      # Dwell visualization
│   ├── FilterPanel.jsx       # Time/filter controls
│   ├── FlowHeatmap.jsx       # Flow visualization
│   ├── ForensicSearch.jsx    # Advanced search
│   ├── LiveData.jsx          # Real-time detections
│   ├── Login.jsx             # Authentication
│   ├── ServerSelector.jsx    # Backend server picker
│   ├── ThreeColumnLayout.jsx # Layout wrapper
│   ├── UserSettings.jsx      # User preferences
│   └── VideoPlayer.jsx       # Video playback
├── context/
│   ├── AuthContext.jsx       # Authentication state
│   ├── ServerContext.jsx     # Backend server selection
│   ├── UserPreferencesContext.jsx # User display prefs
│   └── WebSocketContext.jsx  # WebSocket connection
├── services/
│   └── api.js                # API client (dynamic base URL)
├── utils/
│   └── dateFormat.js         # Date formatting utilities
├── App.jsx                   # Main application
└── main.jsx                  # Entry point
docker/
├── Dockerfile                # Multi-stage build (node → nginx)
└── .dockerignore
deploy/
├── docker-compose.yml        # Frontend-only compose
└── README.md                 # Deployment guide
```

## Building the Docker Image

```bash
docker build -f docker/Dockerfile -t pandosme/dataq-frontend:latest .
docker push pandosme/dataq-frontend:latest
```

## Development Scripts

```bash
npm run dev       # Start dev server (port 5173)
npm run build     # Production build
npm run preview   # Preview production build
npm run lint      # Run ESLint
```

## License

MIT
