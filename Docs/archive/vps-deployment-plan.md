# VPS Deployment Plan

Dedicated LunaNode m.1s VPS (1 GB RAM, 1 vCPU, 15 GB SSD, Ubuntu 24.04). Standalone server — no tunnels, no connection to home network.

## Stack

| Component | Role |
|-----------|------|
| Caddy | Reverse proxy, automatic TLS, static file serving |
| Gunicorn | WSGI server, single eventlet worker |
| Flask + Socket.IO | Application server |
| SQLite (WAL mode) | Database (already in use) |
| systemd | Process management |
| UFW | Firewall (80, 443, SSH only) |

No containers. No nginx. Direct OS install.

## Why This Works

- **Single-worker Gunicorn + eventlet** is already configured (`scripts/run_production.sh`). Eventlet uses cooperative greenlets — one process handles thousands of concurrent connections without threads.
- **Socket.IO binds to the same Flask app** on the same port. No separate WebSocket process needed.
- **SQLite with WAL mode** (`models.py`) supports concurrent reads during writes. Single-worker avoids write contention entirely.
- **Caddy handles WebSocket upgrades automatically** — no special config for `/socket.io/`.
- **No hardcoded domains anywhere** — client-side Socket.IO connects with `io()` (relative path), all API calls use relative paths.
- **Offline-first PWA** — the app works without the server. Server only handles sync, sharing, account links, and subscription checks.
- **Server stores only encrypted blobs** — all AES-256-GCM encryption/decryption happens client-side in `static/Server/crypto.js`. The server never sees plaintext chart data.

## Resource Estimate

| Resource | Usage |
|----------|-------|
| RAM | ~200 MB (Flask + Gunicorn + eventlet) |
| CPU | < 5% idle, < 30% under load |
| Disk | ~50 MB app + SQLite growth |
| Bandwidth | ~7 MB initial page load, minimal after PWA install |

Leaves comfortable headroom on the 1 GB / 1 vCPU / 15 GB spec.

## Deployment Workflow

The current deploy script (`scripts/deploy_to_owlserver.sh`) clones from a local Gitea server, toggles `DEVELOPER_MODE` to `false` in three files via `sed`, strips `.git`, and ships a tarball over SSH. The VPS receives a pre-built archive — it has no git repo.

For the new VPS, choose one of:

**Option A — Keep the tarball approach.** Update the script with the new VPS address and path. Deploy is: run script locally, SSH in, `systemctl restart scc`. Pros: VPS has no git credentials, clean deployments. Cons: full re-upload every time.

**Option B — Git-based deploys.** Clone the repo on the VPS (from Gitea or a remote). Deploy is: `ssh vps`, `cd /srv/StandardChangeChart && git pull`, `systemctl restart scc`. Pros: fast incremental updates. Cons: VPS needs repo access, `DEVELOPER_MODE` toggling must happen elsewhere (build script, env var, or a production branch).

Either way, `run_production.sh` handles venv creation, dependency installation, `.env` generation, and systemd service setup on first run.

## Production Configuration Changes

### CORS (required)

`config.py` line 51 currently allows all origins:

```python
CORS_ALLOWED_ORIGINS = '*'
```

Lock to your production domain:

```python
CORS_ALLOWED_ORIGINS = ['https://yourdomain.com']
```

This controls which origins can open WebSocket connections and make cross-origin API requests. Without this, any third-party website could make requests to your server using a visitor's browser.

### DEVELOPER_MODE (required)

Three files have `DEVELOPER_MODE = true/True`:
- `service-worker.js` — when true, the service worker skips caching (every page load hits the server)
- `static/SCC/config.js` — app-level dev flag
- `config.py` — controls service worker cache headers and requires `IP_HASH_SECRET` to be set

The existing deploy script toggles all three via `sed`. If switching to git-based deploys, handle this through an env var or a production branch instead.

### Static File Serving (recommended)

All static assets currently route through Flask — including vendored libraries (Plotly 4.6 MB, Socket.IO 50 KB, XLSX 952 KB). Caddy can serve these directly from disk, bypassing Python entirely.

```
handle /static/* {
    root * /srv/StandardChangeChart
    file_server
}
```

This gives you proper caching, gzip compression, and range requests for free. Flask should only handle dynamic routes and API calls.

### Rate Limiting (no change needed)

`config.py` uses `RATELIMIT_STORAGE_URI = 'memory://'` — counters live in the Gunicorn process's RAM. This means counters reset on restart, and it only works with a single worker. Both are fine for this setup. Only needs Redis if you ever scale to multiple workers.

## Caddyfile

```
yourdomain.com {
    # Static files — served directly, bypass Flask
    handle /static/* {
        root * /srv/StandardChangeChart
        file_server
    }

    # Service worker — served from app root, not /static/
    handle /service-worker.js {
        root * /srv/StandardChangeChart
        file_server
    }

    # Everything else — Flask/Gunicorn
    reverse_proxy localhost:5002

    encode gzip
}
```

Caddy automatically handles TLS certificates via Let's Encrypt, WebSocket upgrades for `/socket.io/`, and HTTPS redirects. No special WebSocket configuration needed.

## Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## Limits

- Single-worker architecture handles ~1000 concurrent WebSocket connections. Beyond that, you'd need PostgreSQL + Redis as a Socket.IO message queue to run multiple workers. The codebase already has PostgreSQL support (`psycopg2-binary` in requirements.txt, conditional column types in `models.py`) if that day comes.
- Gunicorn restart drops all active WebSocket connections. Clients auto-reconnect (exponential backoff, 1s to 30s) so this is a brief interruption, not data loss.
