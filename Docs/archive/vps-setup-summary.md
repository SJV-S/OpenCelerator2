# StandardChangeChart VPS Setup Summary

**Server:** LunaNode m.1s (1 GB RAM, 1 vCPU, 15 GB SSD)
**OS:** Ubuntu 24.04
**Domain:** scc.pigeondev.net
**IP:** 170.75.171.102
**App path:** /srv/StandardChangeChart

---

## Stack

| Component | Role | Binding |
|-----------|------|---------|
| Caddy | Reverse proxy, TLS, static files | :80, :443 |
| Gunicorn | WSGI server, eventlet worker | 127.0.0.1:5002 |
| Flask + Socket.IO | Application | via Gunicorn |
| SQLite (WAL) | Database | local file |
| systemd | Process management | services: `scc`, `caddy` |
| UFW | Firewall | SSH, 80, 443 only |
| fail2ban | SSH brute-force protection | auto |
| unattended-upgrades | Daily security patches | auto |
| cron | Daily SQLite backup (3 AM UTC) | VPS + dev machine |

---

## Setup Steps (in order)

### 1. SSH Key Auth

On local machine:

```bash
ssh-copy-id ubuntu@170.75.171.102
```

Verified passwordless login, then disabled password auth on VPS:

```bash
sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

### 2. System Updates

```bash
sudo apt update && sudo apt upgrade -y
```

### 3. Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### 4. Install Dependencies

```bash
sudo apt install -y python3 python3-pip python3-venv
```

### 5. Install Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

### 6. DNS

Added A record at Loopia: `scc` → `170.75.171.102` (TTL 300)

Verified: `dig scc.pigeondev.net +short`

### 7. Prepare App Directory

```bash
sudo mkdir -p /srv/StandardChangeChart
sudo chown ubuntu:ubuntu /srv/StandardChangeChart
```

### 8. Deploy App

Ran `deploy_to_scc_vps.sh` from local dev machine. The script:

- Clones from local Gitea
- Strips `.git`
- Toggles `DEVELOPER_MODE` to false in 3 files
- Sets `CORS_ALLOWED_ORIGINS` to `['https://scc.pigeondev.net']`
- Tarballs and ships to VPS via SSH

### 9. Run Production Script

```bash
cd /srv/StandardChangeChart
bash scripts/run_production.sh
```

This script automatically:

- Generates `.env` with random `IP_HASH_SECRET`
- Creates Python venv
- Installs dependencies from `requirements.txt`
- Creates and enables systemd service `scc`
- Starts Gunicorn

Required manual fix: `pip install "eventlet>=0.40.3"` in venv.

### 10. Configure Caddy

```bash
sudo tee /etc/caddy/Caddyfile > /dev/null << 'EOF'
scc.pigeondev.net {
    handle /static/* {
        root * /srv/StandardChangeChart
        file_server
    }

    handle /service-worker.js {
        root * /srv/StandardChangeChart
        file_server
    }

    reverse_proxy localhost:5002

    encode gzip
}
EOF

sudo systemctl restart caddy
```

Caddy automatically obtained TLS certificate from Let's Encrypt.

### 11. Swap File

```bash
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Total swap: ~1.5 GB (Ubuntu default ~512 MB + 1 GB file). Prevents OOM kills during memory spikes.

### 12. fail2ban

```bash
sudo apt install -y fail2ban
```

Default config: bans IP for 10 minutes after 5 failed SSH attempts. Runs automatically.

### 13. Unattended Security Updates

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

Auto-installs security patches daily.

### 14. SQLite Backup Pipeline

**VPS side** — daily safe snapshot at 3 AM UTC:

```bash
sudo apt install -y sqlite3
mkdir -p /srv/StandardChangeChart/backups
```

Backup script at `/srv/StandardChangeChart/scripts/backup_db.sh`:

```bash
#!/bin/bash
DB="/srv/StandardChangeChart/instance/scc_charts.db"
DEST="/srv/StandardChangeChart/backups/scc_charts_$(date +%Y%m%d).db"
if [ -f "$DB" ]; then
    sqlite3 "$DB" ".backup '$DEST'"
    # Keep only last 7 backups
    ls -t /srv/StandardChangeChart/backups/scc_charts_*.db | tail -n +8 | xargs -r rm
fi
```

```bash
chmod +x /srv/StandardChangeChart/scripts/backup_db.sh
(crontab -l 2>/dev/null; echo '0 3 * * * /srv/StandardChangeChart/scripts/backup_db.sh') | crontab -
```

**Dev machine side** — daily pull at 4 AM:

Pull script at `/home/owl/Nextcloud/SCC-VPS-Db-Backups/pull_backup.sh`:

```bash
#!/bin/bash
rsync -az ubuntu@170.75.171.102:/srv/StandardChangeChart/backups/ /home/owl/Nextcloud/SCC-VPS-Db-Backups/
```

```bash
chmod +x /home/owl/Nextcloud/SCC-VPS-Db-Backups/pull_backup.sh
(crontab -l 2>/dev/null; echo '0 4 * * * /home/owl/Nextcloud/SCC-VPS-Db-Backups/pull_backup.sh') | crontab -
```

Backups land in Nextcloud for automatic offsite sync.

---

## Deploy Script (local machine)

Location: `~/PycharmProjects/TC2/scripts/deploy_to_scc_vps.sh`

```bash
#!/usr/bin/env bash
set -e
OWNER="Owl"
REPO="StandardChangeChart"
BRANCH="master"
VPS="ubuntu@170.75.171.102"
VPS_PATH="/srv/$REPO"
LOCAL_GITEA="https://z4yefqvqqmuj2xwmngldklb2zxyo2ktu4e5revac33idoy2zm333g4qd.local"
TMP="/tmp/deploy"
DOMAIN_URL="https://scc.pigeondev.net"

echo "[1/5] Cleaning temp..."
rm -rf "$TMP"

echo "[2/5] Cloning from local Gitea..."
git clone --depth 1 -b "$BRANCH" \
  "${LOCAL_GITEA}/${OWNER}/${REPO}.git" "$TMP"

echo "[3/5] Preparing for production..."
rm -rf "$TMP/.git"
sed -i 's/const DEVELOPER_MODE = true/const DEVELOPER_MODE = false/' "$TMP/service-worker.js"
sed -i 's/export const DEVELOPER_MODE = true/export const DEVELOPER_MODE = false/' "$TMP/static/SCC/config.js"
sed -i 's/DEVELOPER_MODE = True/DEVELOPER_MODE = False/' "$TMP/config.py"
sed -i "s|CORS_ALLOWED_ORIGINS = '\*'|CORS_ALLOWED_ORIGINS = ['$DOMAIN_URL']|" "$TMP/config.py"

echo "[4/5] Deploying to server via tar+ssh..."
tar czf - -C "$TMP" . | ssh "$VPS" "mkdir -p \"$VPS_PATH\" && tar xzf - -C \"$VPS_PATH\""

echo "[5/5] Cleanup..."
rm -rf "$TMP"
echo "Done. Deployed to ${VPS}:${VPS_PATH}"
```

---

## Common Commands

| Action | Command |
|--------|---------|
| Restart app | `sudo systemctl restart scc` |
| App logs | `sudo journalctl -u scc -f` |
| Caddy logs | `sudo journalctl -u caddy -f` |
| App status | `sudo systemctl status scc` |
| Caddy status | `sudo systemctl status caddy` |
| Firewall status | `sudo ufw status` |
| fail2ban status | `sudo systemctl status fail2ban` |
| fail2ban banned IPs | `sudo fail2ban-client status sshd` |
| Manual DB backup (VPS) | `/srv/StandardChangeChart/scripts/backup_db.sh` |
| Manual backup pull (dev) | `/home/owl/Nextcloud/SCC-VPS-Db-Backups/pull_backup.sh` |
| Check swap | `free -h` |
| Check cron jobs (VPS) | `crontab -l` |
| Redeploy | Run deploy script locally, then `sudo systemctl restart scc` on VPS |

---

## Snapshots

Two LunaNode VM snapshots taken:

1. After initial setup (pre-app deployment)
2. After full setup complete (app running, TLS, hardening, backups)

---

## Known Issues

- Gunicorn eventlet worker is deprecated (removal in Gunicorn 26.0). Migrate to gevent or gthread when needed.
