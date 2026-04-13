#!/usr/bin/env bash
set -e

OWNER="Owl"
REPO="StandardChangeChart"
BRANCH="master"
VPS="ubuntu@172.81.179.221"
VPS_PATH="/srv/$REPO"
LOCAL_GITEA="https://varsity-max.local:59111"
TMP="/tmp/deploy-opencelerator"
DOMAIN_URL="https://opencelerator.pigeondev.net"

echo "[1/6] Cleaning temp..."
rm -rf "$TMP"

echo "[2/6] Cloning from local Gitea..."
git clone --depth 1 -b "$BRANCH" \
  "${LOCAL_GITEA}/${OWNER}/${REPO}.git" "$TMP"

echo "[3/6] Preparing for production..."
rm -rf "$TMP/.git"
sed -i 's/const DEVELOPER_MODE = true/const DEVELOPER_MODE = false/' "$TMP/service-worker.js"
sed -i 's/export const DEVELOPER_MODE = true/export const DEVELOPER_MODE = false/' "$TMP/static/SCC/config.js"
sed -i 's/DEVELOPER_MODE = True/DEVELOPER_MODE = False/' "$TMP/config.py"
sed -i "s|CORS_ALLOWED_ORIGINS = '\*'|CORS_ALLOWED_ORIGINS = ['$DOMAIN_URL']|" "$TMP/config.py"
sed -i 's/0.0.0.0:5002/127.0.0.1:5002/' "$TMP/scripts/run_production.sh"
sed -i 's/"name": "Standard Change Chart"/"name": "OpenCelerator"/' "$TMP/static/manifest.json"
sed -i 's/"short_name": "SCC"/"short_name": "OpenCelerator"/' "$TMP/static/manifest.json"
sed -i "s/APP_NAME = 'Standard Change Chart'/APP_NAME = 'OpenCelerator'/" "$TMP/config.py"
sed -i "s/APP_NAME = 'Standard Change Chart'/APP_NAME = 'OpenCelerator'/" "$TMP/static/SCC/config.js"

echo "[4/6] Deploying to server via tar+ssh..."
tar czf - -C "$TMP" . | ssh "$VPS" "mkdir -p \"$VPS_PATH\" && tar xzf - -C \"$VPS_PATH\""

echo "[5/6] Restarting server..."
ssh "$VPS" "sudo systemctl restart scc"

echo "[6/6] Cleanup..."
rm -rf "$TMP"

echo "Done. Deployed to ${VPS}:${VPS_PATH}"
