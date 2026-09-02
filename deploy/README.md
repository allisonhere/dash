# Deploying dash

dash runs as **one Docker container** on the LAN (e.g. the docker host
`192.168.86.74`). Every device — desktops and phone — opens the same URL, and
edits (bookmarks, feeds, theme) write back to a mounted volume. No internet or
webhost involved.

- **Data** (`bookmarks.json`, `feeds.json`, `groups.json`, `homelab.json`, `theme.json`) lives
  in the `./data` volume. Edits from any browser persist there.
- **Built-in themes** are the default and work with zero setup.

## Run it

```bash
# on the host that will serve dash (e.g. 192.168.86.74):
git clone <repo> dash && cd dash
mkdir -p data
# seed with existing data if you have it:
cp ~/.config/custom-dash/bookmarks.json data/ 2>/dev/null || true
cp ~/.config/custom-dash/feeds.json    data/ 2>/dev/null || true
# homelab page: use the mounted docker socket instead of SSH
[ -f ~/.config/custom-dash/homelab.json ] && \
  jq '.dockerHosts=[{"name":"services","ssh":"local"}]' ~/.config/custom-dash/homelab.json > data/homelab.json

docker compose up -d --build
```

Open `http://<host-ip>:3939` from any device on the LAN.

## Install as an app

Dash includes a web app manifest, local app icons, and a service worker for its
static assets. Open Dash over HTTPS, then use the browser's **Install app** or
**Add to Home Screen** command. Browsers do not enable service workers for a
plain HTTP LAN address; `localhost` is the development-only exception.

## Backup and restore

Open **Settings**, then use **Download backup** to export bookmarks, feeds,
groups, and the selected theme in one versioned JSON file. The restore form
validates the complete file before replacing current data. Homelab configuration
and credentials are intentionally excluded, so continue backing up `./data`
when you need a full server recovery copy.

## Update it from this repo

From your local checkout:

```bash
./deploy.sh full
```

That runs the local Svelte checks, builds the production bundle, validates the
Compose file, commits any local changes, pushes `master` to GitHub, then tells
`allie@jarvis:~/dash` to pull and rebuild:

```bash
cd ~/dash
git pull --ff-only origin master
docker compose up -d --build
```

Useful focused commands:

```bash
./deploy.sh status
./deploy.sh check
./deploy.sh deploy
./deploy.sh verify
```

Defaults can be overridden without editing the script:

```bash
DASH_DEPLOY_HOST=allie@jarvis \
DASH_REMOTE_DIR=~/dash \
DASH_URL=http://192.168.86.74:3939 \
./deploy.sh full
```

Key points in `compose.yaml`:
- The container uses host networking and binds Dash directly to port `3939` so
  its NUT collector can reach an UPS daemon on the Docker host at `127.0.0.1`.
- The app trusts all CSRF origins because it is intended for LAN-only use and may
  be reached by IP, hostname, or reverse-proxy name. Restrict `csrf.trustedOrigins`
  in `vite.config.ts` before exposing it publicly.
- `./data:/config` is the writable store — back this dir up.
- `/var/run/docker.sock:...:ro` lets the Homelab page read the host's containers
  (set a docker host with `"ssh": "local"` in `homelab.json`). Proxmox is reached
  over the LAN via the token in `homelab.json` — that file stays here, never leaves.
- A NUT UPS can be added with `"ups": {"name":"Server UPS","host":"192.168.1.10","port":3493,"upsName":"cyberpower"}`.
  The NUT server must allow read-only LAN connections from the Dash container.

## Notes

- Outside a container, `node build` still works; without `DASH_CONFIG_DIR` set it
  uses `~/.config/custom-dash/`. Handy for development.
- `DASH_STORE_URL`/`DASH_STORE_TOKEN` (see `src/lib/server/store.ts`) can point the
  data at a shared HTTP store instead of the local volume — unused in this
  single-container setup, available if you ever want multiple instances.
