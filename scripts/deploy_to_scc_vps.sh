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
sed -i 's/0.0.0.0:5002/127.0.0.1:5002/' "$TMP/scripts/run_production.sh"

echo "[4/5] Deploying to server via tar+ssh..."
tar czf - -C "$TMP" . | ssh "$VPS" "mkdir -p \"$VPS_PATH\" && tar xzf - -C \"$VPS_PATH\""

echo "[5/5] Cleanup..."
rm -rf "$TMP"

echo "Done. Deployed to ${VPS}:${VPS_PATH}"
