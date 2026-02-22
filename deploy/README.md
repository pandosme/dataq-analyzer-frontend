# DataQ Analyzer Frontend — Deployment

## Quick Start

```bash
docker pull pandosme/dataq-frontend:latest
docker run -d --name dataq-frontend -p 3303:80 --restart unless-stopped pandosme/dataq-frontend:latest
```

Or with docker-compose:

```bash
curl -O https://raw.githubusercontent.com/pandosme/dataq-analyzer-frontend/main/deploy/docker-compose.yml
docker compose up -d
```

Open `http://<your-server>:3303`, select a backend server, and log in.

## How It Works

The frontend is a static React SPA served by nginx. On the login screen, users select which DataQ backend to connect to. All API and WebSocket traffic goes directly from the browser to the chosen backend — no server-side proxy is needed.

## Common Commands

```bash
# Start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Update
docker compose pull && docker compose up -d
```

## Troubleshooting

### Cannot connect to backend

1. Ensure the backend is reachable from the browser (not just the Docker host)
2. Check if the backend is running: `curl http://<backend-host>:3303/api/health`
3. Ensure CORS and firewall allow connections from the browser

### Container won't start

```bash
docker compose logs dataq-frontend
```
