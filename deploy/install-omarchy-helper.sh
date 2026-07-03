#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${DASH_REPO_URL:-git@github.com:allisonhere/dash.git}"
INSTALL_DIR="${DASH_HELPER_DIR:-$HOME/Projects/dash}"
SERVICE_DIR="$HOME/.config/systemd/user"
SERVICE_NAME="dash-omarchy-helper.service"

missing() {
	echo "Missing required command: $1" >&2
	exit 1
}

command -v git >/dev/null || missing git
command -v npm >/dev/null || missing npm
command -v systemctl >/dev/null || missing systemctl

if [ ! -d "$INSTALL_DIR/.git" ]; then
	mkdir -p "$(dirname "$INSTALL_DIR")"
	git clone "$REPO_URL" "$INSTALL_DIR"
else
	git -C "$INSTALL_DIR" pull --ff-only
fi

cd "$INSTALL_DIR"
npm install

mkdir -p "$SERVICE_DIR"
sed "s#WorkingDirectory=%h/Projects/dash#WorkingDirectory=$INSTALL_DIR#" \
	deploy/dash-omarchy-helper.service > "$SERVICE_DIR/$SERVICE_NAME"

systemctl --user daemon-reload
systemctl --user enable --now "$SERVICE_NAME"

echo "Dash Omarchy helper installed and started."
echo "Status: systemctl --user status $SERVICE_NAME"
echo "Test:   curl http://127.0.0.1:43741/theme"
