#!/bin/bash
# StandardChangeChart - Git push helper
#
# Remote: Gitea on Start9
# Local: https://varsity-max.local:59111/Owl/StandardChangeChart.git
# Tor:   http://z4yefqvqqmuj2xwmngldklb2zxyo2ktu4e5revac33idoy2zm333g4qd.onion/Owl/StandardChangeChart.git
#
# Usage:
#   ./push_to_my_gitea.sh              # commits with message "Update"
#   ./push_to_my_gitea.sh "Fix bug"    # commits with custom message
#
# Setup (if remote not configured):
#   git remote add origin https://varsity-max.local:59111/Owl/StandardChangeChart.git
#   git push -u origin master

cd "$(dirname "$0")/.."



# Sync SW_VERSION and APP_VERSION from config.py
APP_VER=$(grep -oP "APP_VERSION = '\K[^']+" config.py)
if [ -n "$APP_VER" ]; then
    sed -i "s/const SW_VERSION = '.*'/const SW_VERSION = '$APP_VER'/" service-worker.js
    sed -i "s/export const APP_VERSION = '.*'/export const APP_VERSION = '$APP_VER'/" static/SCC/config.js
fi

git add -A
if git diff --cached --quiet; then
    echo "Nothing to commit."
else
    git commit -m "${1:-Update}"
fi
git push
