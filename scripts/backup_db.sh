#!/bin/bash
DB="/srv/StandardChangeChart/instance/scc_charts.db"
DEST="/srv/StandardChangeChart/backups/scc_charts_$(date +%Y%m%d).db"

if [ -f "$DB" ]; then
    sqlite3 "$DB" ".backup '$DEST'"
    # Keep only last 7 backups
    ls -t /srv/StandardChangeChart/backups/scc_charts_*.db | tail -n +8 | xargs -r rm
fi