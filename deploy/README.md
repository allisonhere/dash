# Deploying dash

dash runs as **one Docker container** on the LAN (e.g. the docker host
`192.168.86.74`). Every device — desktops and phone — opens the same URL, and
edits (bookmarks, feeds, theme) write back to a mounted volume. No internet or
webhost involved.

- **Data** (`bookmarks.json`, `feeds.json`, `groups.json`, `homelab.json`, `theme.json`) lives
  in the `./data` volume. Edits from any browser persist there.
- **Built-in themes** are the default and work with zero setup.
- **Match omarchy** reads a bind-mounted copy of your omarchy theme (see below).
- **This device's Omarchy** reads the current theme from a local helper running
  on the Omarchy desktop that is viewing the dashboard.

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

## Match omarchy (optional)

The dashboard reads a **bind-mounted copy** of your omarchy theme (the `./omarchy`
volume, exposed as `OMARCHY_DIR=/omarchy`). Once it's present, "Match omarchy"
appears in the theme picker and applies your desktop colors.

Sync your omarchy theme to the host running the container (from an omarchy desktop):

```bash
rsync -aL ~/.local/state/omarchy/current/ jarvis:~/dash/omarchy/current/
```

Omarchy 4 moved the live theme to `~/.local/state/omarchy/current`; on Omarchy 3
copy `~/.config/omarchy/current/` instead. Dash reads whichever layout is
present, and `OMARCHY_STATE_DIR` overrides the state-dir lookup the way
`OMARCHY_DIR` overrides the config one.

Re-run that whenever you change your desktop theme and want the dashboard to
follow, then reload the page (or it picks it up on next load). If you run dash
directly on an omarchy desktop instead of a container, drop the `OMARCHY_DIR`
env and it reads the desktop's live theme directly.

## This device's Omarchy (optional)

When dash is deployed on `192.168.86.74`, the container cannot read the
desktop's live omarchy directory directly. Start the local helper on each
Omarchy desktop that should drive its own browser theme:

```bash
npm run omarchy:helper
```

Then open dash, use the theme menu, and choose **This device's Omarchy**. The
choice is stored in that browser only. The helper watches
the live `current` directory (`~/.local/state/omarchy/current` on Omarchy 4), so
changing your Omarchy theme updates the open dash tab automatically.

To start it automatically after login, install the user service from this repo:

```bash
mkdir -p ~/.config/systemd/user
cp deploy/dash-omarchy-helper.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now dash-omarchy-helper.service
```

The service assumes this repo lives at `~/Projects/dash`. If it is somewhere
else, edit `WorkingDirectory=` in
`~/.config/systemd/user/dash-omarchy-helper.service` before enabling it.

Useful service commands:

```bash
systemctl --user status dash-omarchy-helper.service
systemctl --user restart dash-omarchy-helper.service
journalctl --user -u dash-omarchy-helper.service -f
```

The helper listens only on `127.0.0.1:43741`. Override defaults if needed:

```bash
OMARCHY_HELPER_PORT=43741 OMARCHY_DIR=~/.config/omarchy npm run omarchy:helper
```

If the Omarchy desktop is a different machine on the LAN, bind the helper to
the LAN interface:

```bash
OMARCHY_HELPER_HOST=0.0.0.0 OMARCHY_HELPER_PORT=43741 npm run omarchy:helper
```

Then open Dash's theme menu, enter `http://<omarchy-desktop-ip>:43741` in the
helper URL field, and choose **This device's Omarchy**.

For the user service, persist the same setting with:

```bash
mkdir -p ~/.config/dash
printf 'OMARCHY_HELPER_HOST=0.0.0.0\nOMARCHY_HELPER_PORT=43741\n' > ~/.config/dash/omarchy-helper.env
systemctl --user restart dash-omarchy-helper.service
```

## Notes

- Outside a container, `node build` still works; without `DASH_CONFIG_DIR` set it
  uses `~/.config/custom-dash/`. Handy for development.
- `DASH_STORE_URL`/`DASH_STORE_TOKEN` (see `src/lib/server/store.ts`) can point the
  data at a shared HTTP store instead of the local volume — unused in this
  single-container setup, available if you ever want multiple instances.
