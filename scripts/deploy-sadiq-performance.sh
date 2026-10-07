#!/usr/bin/env bash
set -euo pipefail

APP="/var/www/sadiq-wms"
BASE="https://raw.githubusercontent.com/sharyatpall123-eng/3266-sediq/main"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$APP/Backup-performance-$STAMP"

if [ ! -d "$APP" ]; then
  echo "Sadiq app directory not found: $APP" >&2
  exit 1
fi

mkdir -p \
  "$BACKUP/server/src/controllers" \
  "$BACKUP/client/src/pages" \
  "$BACKUP/client/src/components/layout" \
  "$BACKUP/client/src/routes"

FILES=(
  "server/src/controllers/dashboardController.js"
  "server/src/controllers/representativeController.js"
  "client/src/pages/DashboardPage.jsx"
  "client/src/components/layout/Sidebar.jsx"
  "client/src/routes/AppRoutes.jsx"
)

for file in "${FILES[@]}"; do
  if [ -f "$APP/$file" ]; then
    cp "$APP/$file" "$BACKUP/$file"
  fi
  mkdir -p "$(dirname "$APP/$file")"
  curl -fsSL "$BASE/$file" -o "$APP/$file.new"
  mv "$APP/$file.new" "$APP/$file"
done

node --check "$APP/server/src/controllers/dashboardController.js"
node --check "$APP/server/src/controllers/representativeController.js"

npm --prefix "$APP/client" run build

pm2 restart sadiq-wms-api --update-env
sleep 2

curl -fsS "http://127.0.0.1:5002/api/health"
echo
curl -fsSI "https://3266.azizbusiness.com" | head -n 1

echo "Sadiq performance deployment completed."
echo "Backup: $BACKUP"
