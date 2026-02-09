#!/bin/bash
# Production server for StandardChangeChart
# Runs gunicorn with eventlet worker for WebSocket support
# Bound to 0.0.0.0:5002 for Pangolin/WireGuard tunnel

set -e

FOREGROUND=false
while getopts "f" opt; do
    case $opt in
        f) FOREGROUND=true ;;
        *) echo "Usage: $0 [-f]  (-f = foreground)"; exit 1 ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
VENV_DIR="$APP_DIR/venv"
SERVICE="scc"
SERVICE_FILE="/etc/systemd/system/${SERVICE}.service"

# Kill any existing server first
"$SCRIPT_DIR/kill_production.sh"

cd "$APP_DIR"

# Generate .env with random IP_HASH_SECRET on first run
if [ ! -f "$APP_DIR/.env" ]; then
    echo "Generating .env with random IP_HASH_SECRET..."
    SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    echo "IP_HASH_SECRET=$SECRET" > "$APP_DIR/.env"
    chmod 600 "$APP_DIR/.env"
fi

# Check if virtual environment exists, create if not
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment at $VENV_DIR..."
    python3 -m venv "$VENV_DIR"
fi

# Activate virtual environment
source "$VENV_DIR/bin/activate"

# Check dependencies
echo "Checking dependencies..."
if pip install --dry-run -r requirements.txt 2>&1 | grep -q "Would install"; then
    echo "Installing/updating dependencies..."
    pip install -r requirements.txt
else
    echo "All dependencies satisfied."
fi

# Set up systemd service if not already installed
if [ ! -f "$SERVICE_FILE" ]; then
    echo "Installing systemd service..."
    sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=StandardChangeChart
After=network.target

[Service]
Type=exec
User=$(whoami)
WorkingDirectory=$APP_DIR
ExecStart=$VENV_DIR/bin/gunicorn -w 1 -k eventlet -b 0.0.0.0:5002 app:app
ExecStop=/bin/kill -TERM \$MAINPID
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
    sudo systemctl enable "$SERVICE"
    echo "Systemd service installed and enabled."
fi

if [ "$FOREGROUND" = true ]; then
    echo "Starting server in foreground (Ctrl+C to stop)..."
    "$VENV_DIR/bin/gunicorn" -w 1 -k eventlet -b 0.0.0.0:5002 app:app
else
    echo "Starting server via systemd..."
    sudo systemctl start "$SERVICE"
    echo "Running. Use 'sudo journalctl -u $SERVICE -f' to tail logs."
fi
