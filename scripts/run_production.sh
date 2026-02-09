#!/bin/bash
# Production server for StandardChangeChart
# Runs gunicorn with eventlet worker for WebSocket support
# Bound to 0.0.0.0:5002 for Pangolin/WireGuard tunnel

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
VENV_DIR="$APP_DIR/venv"
SERVICE="scc"
SERVICE_FILE="/etc/systemd/system/${SERVICE}.service"

# Kill any existing server first
"$SCRIPT_DIR/kill_production.sh"

cd "$APP_DIR"

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

echo "Starting server via systemd..."
sudo systemctl start "$SERVICE"
echo "Running. Use 'sudo journalctl -u $SERVICE -f' to tail logs."
