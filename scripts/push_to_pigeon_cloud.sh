#!/usr/bin/env bash
set -e

OWNER="Owl"
REPO="StandardChangeChart"
BRANCH="master"
VPS="pigeondev@170.75.172.2"
VPS_PATH="~/$REPO"
LOCAL_GITEA="https://z4yefqvqqmuj2xwmngldklb2zxyo2ktu4e5revac33idoy2zm333g4qd.local"
APP_DIR="$REPO"
TMP="/tmp/deploy"

echo "[1/6] Cleaning temp..."
rm -rf "$TMP"

echo "[2/6] Cloning from local Gitea..."
git clone --depth 1 -b "$BRANCH" \
  "${LOCAL_GITEA}/${OWNER}/${REPO}.git" "$TMP"

echo "[2.5/6] Stripping git metadata..."
rm -rf "$TMP/.git"

echo "[3/6] Copying to VPS via tar+ssh (fast)..."
tar czf - -C "$TMP" . | ssh "$VPS" "mkdir -p \"$VPS_PATH\" && tar xzf - -C \"$VPS_PATH\""

echo "[4/6] Deploying locally..."
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"
cp -a "$TMP/." "$APP_DIR/"

echo "[5/6] Cleanup..."
rm -rf "$TMP"

echo "[6/6] Done. Files on VPS at ${VPS}:${VPS_PATH} and locally at ./${APP_DIR}"

