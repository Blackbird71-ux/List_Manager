#!/bin/sh
# Run on the NAS as: sudo sh /volume1/docker/listsmanager/deploy-nas.sh

set -e

echo "=== Stopping old container ==="
docker stop listsmanager-app 2>/dev/null || true
docker rm -f listsmanager-app 2>/dev/null || true

echo "=== Removing old image ==="
docker image rm listsmanager:latest -f 2>/dev/null || true

echo "=== Loading new image ==="
docker load -i /volume1/docker/listsmanager/listsmanager.tar

echo "=== Creating network ==="
docker network create listsmanager-network 2>/dev/null || true

echo "=== Setting data directory permissions ==="
mkdir -p /volume1/docker/listsmanager/Data
mkdir -p /volume1/docker/listsmanager/Data/attachments
mkdir -p /volume1/docker/listsmanager/Data/backups
mkdir -p /volume1/docker/listsmanager/cloudflared
chown -R 1001:1001 /volume1/docker/listsmanager/Data
chmod 755 /volume1/docker/listsmanager/Data
chmod 777 /volume1/docker/listsmanager/cloudflared

echo "=== Starting listsmanager-app ==="
docker run -d \
  --name listsmanager-app \
  --restart unless-stopped \
  --network listsmanager-network \
  -p 3002:3000 \
  -v /volume1/docker/listsmanager/Data:/data \
  -v /volume1/docker/listsmanager/cloudflared:/etc/cloudflared \
  --env-file /volume1/docker/listsmanager/.env.local \
  -e DATABASE_URL=file:/data/listsmanager.db \
  -e NODE_ENV=production \
  -e TZ=Australia/Sydney \
  -e AUTH_URL=https://lists.liddleapps.com \
  listsmanager:latest

echo "=== Waiting for app to start ==="
sleep 5

echo "=== Logs ==="
docker logs listsmanager-app --tail 40

echo "=== Cleaning up old images ==="
docker image prune -f

echo "=== Done! ListsManager should be live at http://sovereign-main:3002 ==="
echo "=== (and https://lists.liddleapps.com once the tunnel is configured) ==="
