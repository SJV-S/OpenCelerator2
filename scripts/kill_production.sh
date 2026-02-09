#!/bin/bash
# Stop the StandardChangeChart production server

SERVICE="scc"

if systemctl is-active --quiet "$SERVICE" 2>/dev/null; then
    echo "Stopping $SERVICE service..."
    sudo systemctl stop "$SERVICE"
    echo "Stopped."
else
    # Fallback: kill by process match in case systemd isn't set up yet
    if pkill -f "gunicorn.*:5002" 2>/dev/null; then
        echo "Killed gunicorn process on port 5002."
    else
        echo "No running server found."
    fi
fi
