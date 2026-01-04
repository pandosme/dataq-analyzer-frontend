# DataQ Analyzer - Frontend

User-facing React application for visualizing and analyzing Axis DataQ camera path and flow data.

## Overview

This is the user frontend for DataQ Analyzer, providing real-time and historical data visualization for authorized users. The frontend communicates with the backend API for authentication and data retrieval.

## Features

- 📡 **Live Data** - Real-time path detection visualization with live video (local cameras) or snapshots (remote cameras)
- 🔥 **Flow Heatmap** - Visualize object movement paths over time with entry/exit points
- ⏱️ **Dwell Heatmap** - Heat map showing where objects spend time
- 🔍 **Forensic Search** - Advanced search with filters and video playback integration
- 🔐 **User Authentication** - JWT-based authentication with camera-level authorization
- 📊 **Statistics** - Real-time statistics for path events

## Quick Start

### Prerequisites

- Node.js 18+
- Backend API running (see [dataq-analyzer-backend](https://github.com/your-org/dataq-analyzer-backend))

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/dataq-analyzer-frontend.git
   cd dataq-analyzer-frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your backend API URL
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Access the application**
   - Frontend: http://localhost:5173
   - Login with credentials provided by your administrator

### Production Deployment

#### Option 1: Docker with Nginx

```bash
# Build Docker image with backend API URL
docker build \
  --build-arg VITE_API_URL=http://backend-server:3000 \
  -t dataq-frontend \
  -f docker/Dockerfile .

# Run container
docker run -d -p 80:80 --name dataq-frontend dataq-frontend

# Access at http://localhost
```

#### Option 2: Static Build

```bash
# Build for production
VITE_API_URL=https://api.example.com npm run build

# Deploy dist/ folder to web server
# Configure web server (Nginx/Apache) to:
#   - Serve index.html for all routes (SPA routing)
#   - Set proper cache headers for static assets
```

#### Example Nginx Configuration

```nginx
server {
    listen 80;
    server_name example.com;
    root /usr/share/nginx/html;
    index index.html;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Don't cache index.html
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
```

## Configuration

### Environment Variables

See [.env.example](.env.example) for configuration.

**Required:**
- `VITE_API_URL` - Backend API URL
  - Development: `http://localhost:3000`
  - Production: `http://backend-server-ip:3000` or `https://api.example.com`

**Note:** In production, environment variables are baked into the build. Rebuild the application if the API URL changes.

### Backend API Requirements

The frontend requires a running backend API with the following endpoints:
- `POST /api/auth/login` - User authentication
- `GET /api/auth/me` - Get current user info
- `GET /api/cameras` - List cameras (filtered by user authorization)
- `GET /api/cameras/:serialNumber/snapshot` - Get camera snapshot
- `GET /api/paths` - Query path events
- `GET /api/paths/stats/:serialNumber` - Get path statistics

## Features

### Live Data (Detections)

Real-time path detection monitoring:
- **Local cameras:** Live RTSP video stream with canvas overlay
- **Remote cameras:** Static snapshot with path visualization
- Configurable object type filters
- Minimum distance and age filters
- Auto-refresh every 2 seconds

### Flow Heatmap

Visualize movement patterns:
- Entry points (green) and exit points (red)
- Color-coded by object class
- Adjustable line transparency
- Statistics panel with count and average age
- Preset and custom time ranges

### Dwell Heatmap

Heat map of dwell times:
- Color gradient from blue (short dwell) to red (long dwell)
- Adjustable minimum dwell time filter
- Adjustable opacity/intensity
- Statistics for average dwell time per class

### Forensic Search

Advanced search capabilities:
- Time range selection (3 hours to 2 months)
- Object class and direction filters
- Entry/exit zone selection (draw on image)
- Age, dwell, and color filters
- Video playback integration (VideoX)
- Results table with timestamp and anomaly detection

## User Roles

### Regular Users

Regular users have access to:
- All viewing applications (Live Data, Flow Heatmap, Dwell Heatmap, Forensic Search)
- Cameras they are authorized for (assigned by admin)
- Their own profile information

Users **cannot:**
- Create or modify cameras
- Manage other users
- Change system configuration

For administrative tasks, use the [Admin UI](https://github.com/your-org/dataq-analyzer-backend) (served by the backend at `/admin`).

## Development

### NPM Scripts

```bash
npm run dev          # Start development server (port 5173)
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm run docker:build # Build Docker image
npm run docker:run   # Run Docker container
npm run docker:stop  # Stop and remove container
```

### Project Structure

```
dataq-analyzer-frontend/
├── src/
│   ├── components/          # React components
│   │   ├── LiveData.jsx     # Real-time detections
│   │   ├── FlowHeatmap.jsx  # Flow visualization
│   │   ├── DwellHeatmap.jsx # Dwell visualization
│   │   ├── ForensicSearch.jsx # Advanced search
│   │   ├── CameraSelector.jsx # Camera picker
│   │   ├── FilterPanel.jsx  # Time/filter controls
│   │   └── Login.jsx        # Authentication
│   ├── context/             # React context providers
│   │   ├── AuthContext.jsx  # Authentication state
│   │   └── DateFormatContext.jsx # Date formatting
│   ├── services/            # API client
│   │   └── api.js           # Axios-based API calls
│   ├── utils/               # Utility functions
│   ├── App.jsx              # Main application
│   └── main.jsx             # Entry point
├── public/                  # Static assets
│   └── media-stream-player.min.js # RTSP player
├── docker/                  # Docker configuration
│   ├── Dockerfile           # Nginx-based production image
│   └── nginx.conf           # Nginx SPA configuration
└── vite.config.js           # Vite build configuration
```

## Camera Types

### Local Cameras

- Direct network access via VAPIX API
- Live RTSP video streaming in Live Data view
- Real-time snapshot updates
- Requires camera to be on same network as backend

### Remote Cameras

- MQTT-only data (no direct network access)
- Static snapshot images
- Data received via MQTT broker
- Can be anywhere with MQTT connectivity

## Troubleshooting

### Cannot Login

**Problem:** "Invalid credentials" or "Network error"

**Solutions:**
- Verify backend API is running and accessible
- Check `VITE_API_URL` in .env points to correct backend
- Verify credentials with administrator
- Check browser console for CORS errors

### No Cameras Visible

**Problem:** Camera selector is empty

**Solutions:**
- Contact administrator to authorize cameras for your user
- Verify you're logged in (username shows in header)
- Check that cameras exist in the system (admin must add them)

### Video Not Loading (Forensic Search)

**Problem:** Video player shows error or blank

**Solutions:**
- Ensure playback system (VideoX, ACS, Milestone) is configured by admin
- Verify camera has recording capability
- Check that event timestamp is within recording retention period

### CORS Errors

**Problem:** Browser console shows CORS policy errors

**Solutions:**
- Backend must set `CORS_ORIGIN` environment variable to include frontend URL
- Contact administrator to update backend configuration
- For development, ensure backend `CORS_ORIGIN=*` allows all origins

### Blank Page After Login

**Problem:** Page is white/blank after successful login

**Solutions:**
- Check browser console for JavaScript errors
- Try hard refresh (Ctrl+F5 or Cmd+Shift+R)
- Clear browser cache and localStorage
- Verify build was successful: check dist/ folder for assets

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

**Note:** Live video streaming requires browser support for Media Source Extensions (MSE).

## License

MIT

## Support

For issues and questions:
- GitHub Issues: https://github.com/your-org/dataq-analyzer-frontend/issues
- Backend Repository: https://github.com/your-org/dataq-analyzer-backend
- Contact your system administrator for user-specific issues
