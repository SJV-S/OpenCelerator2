#!/usr/bin/env bash
set -e

sudo tee /etc/caddy/Caddyfile > /dev/null << 'EOF'
opencelerator.pigeondev.net {
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
echo "Caddy restarted with opencelerator.pigeondev.net config."