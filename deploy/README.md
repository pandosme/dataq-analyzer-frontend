# DataQ Analyzer Frontend Deployment

## Quick Start

1. Download the deployment files to your server:
   ```bash
   curl -O https://raw.githubusercontent.com/pandosme/dataq-frontend/main/deploy/docker-compose.yml
   curl -O https://raw.githubusercontent.com/pandosme/dataq-frontend/main/deploy/setup.sh
   chmod +x setup.sh
   ```

2. Run the setup script:
   ```bash
   ./setup.sh
   ```

3. Follow the prompts to configure:
   - Frontend port (default: 8303)
   - Backend URL (e.g., `http://192.168.1.100:3303`)

## Manual Setup

If you prefer manual configuration:

1. Create a `.env` file:
   ```bash
   FRONTEND_PORT=8303
   BACKEND_URL=http://your-backend-server:3303
   ```

2. Pull and start the container:
   ```bash
   docker compose pull
   docker compose up -d
   ```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `FRONTEND_PORT` | 8303 | Port the frontend web interface listens on |
| `BACKEND_URL` | http://host.docker.internal:3303 | URL of the DataQ backend API |

## Common Commands

```bash
# View logs
docker compose logs -f

# Stop the service
docker compose down

# Start the service
docker compose up -d

# Update to latest version
docker compose pull
docker compose up -d

# Restart the service
docker compose restart
```

## Network Configuration

### Backend on Same Host

If the backend is running on the same host (not in Docker):
```bash
BACKEND_URL=http://host.docker.internal:3303
```

### Backend on Different Server

If the backend is on a different server:
```bash
BACKEND_URL=http://192.168.1.100:3303
```

### Backend in Docker (Same Host)

If the backend is also running in Docker on the same host, you can use Docker networking:

```yaml
# docker-compose.yml
services:
  dataq-frontend:
    image: pandosme/dataq-frontend:latest
    ports:
      - "8303:80"
    environment:
      - BACKEND_URL=http://dataq-backend:3303
    networks:
      - dataq-network

networks:
  dataq-network:
    external: true
```

## Troubleshooting

### Cannot connect to backend

1. Verify the backend URL is correct
2. Check if the backend is running: `curl http://your-backend:3303/api/health`
3. Ensure firewall allows connections to the backend port

### Container won't start

Check the logs:
```bash
docker compose logs dataq-frontend
```

### WebSocket connection failed

Ensure the backend URL includes the correct protocol and port. WebSocket connections are proxied through nginx automatically.
