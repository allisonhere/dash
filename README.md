# Dash

Dash is a personal SvelteKit dashboard for bookmarks, RSS feeds, and homelab
status. It runs as one Node container and stores its configuration in JSON files
mounted at `/config`.

## Features

- Searchable bookmark groups with automatic service icons, recent items, and up
  to eight pinned shortcuts
- RSS and Atom feed reader with per-feed error reporting
- Live Proxmox, Docker, and NUT UPS status with guarded power controls
- Built-in themes
- Responsive desktop and mobile navigation with safe-area spacing
- Installable PWA metadata and app icons
- Versioned backup and restore for bookmarks, feeds, groups, and theme selection

## Run with Docker Compose

```sh
git clone git@github.com:allisonhere/dash.git
cd dash
mkdir -p data
docker compose up -d --build
```

Open `http://<host-ip>:3939`. The production Compose stack uses host networking
so the NUT collector can reach a UPS daemon on the Docker host.

The published container is available at:

```text
ghcr.io/allisonhere/dash:latest
```

Pull and recreate an existing deployment without rebuilding locally:

```sh
git pull --ff-only origin master
docker compose pull dash
docker compose up -d --no-build dash
docker compose ps
```

If Docker or Portainer has stale GHCR credentials, force one anonymous pull
without deleting the saved credentials:

```sh
ghcr_config=$(mktemp -d)
DOCKER_CONFIG="$ghcr_config" docker compose pull dash
rm -r "$ghcr_config"
docker compose up -d --no-build dash
```

See [deploy/README.md](deploy/README.md) for the Jarvis deployment, NUT,
Docker socket, and Proxmox configuration.

## Local development

Requirements:

- Node.js 22 or newer
- npm

Install dependencies and start Vite:

```sh
npm install
npm run dev
```

Without `DASH_CONFIG_DIR`, local runs read and write
`~/.config/custom-dash/`.

Run the checks used before deployment:

```sh
npm test
npm run check
npm run build
```

## Isolated test environment

The test stack builds the current checkout at `http://localhost:3940`:

```sh
npm run test:env
```

It uses `compose.test.yaml`, a separate `dash-test-data` volume, bridge
networking, and no Docker socket. It cannot read the production homelab file or
control containers on the host.

Useful commands:

```sh
npm run test:env -- status
npm run test:env -- logs
npm run test:env -- down
```

Set `DASH_TEST_PORT` in `.env.test` if port 3940 is occupied.

### Seed the test environment

Open Settings on the live dashboard and download a backup. Open
`http://localhost:3940/settings`, select that file under Restore backup, confirm
the replacement, and restore it. This copies bookmarks, feeds, groups, and the
theme without copying homelab credentials.

The named test volume keeps the restored data after `npm run test:env -- down`.

## Data and backups

The production Compose file mounts `./data` at `/config`.

| File | Contents |
| --- | --- |
| `bookmarks.json` | Bookmark URLs, groups, pin dates, and recent-use metadata |
| `feeds.json` | RSS and Atom feed subscriptions |
| `groups.json` | Saved group names and colors |
| `theme.json` | Theme mode and selected built-in theme |
| `homelab.json` | Proxmox, Docker host, and NUT connection settings |

Settings also has a link check that requests every bookmark and reports the
broken, unreachable, blocked, and moved ones. Hosts on the LAN are checked
without TLS verification because self-hosted services usually serve their own
certificates.

Settings can export and restore the first four data sets. The browser backup
excludes `homelab.json` because it may contain access tokens. Back up the whole
`./data` directory for server recovery.

Dash can use a shared HTTP data store instead of local collection files. Set
`DASH_STORE_URL` and, when required, `DASH_STORE_TOKEN`. Theme and homelab
configuration remain local to each Dash instance.

## PWA installation

Dash includes a web app manifest, local icons, and a service worker for static
assets. Browsers require HTTPS before they enable installation and service
workers. `localhost` is allowed for development, but a plain HTTP LAN address
is not.

Serve Dash through an HTTPS reverse proxy, then use the browser's Install app
or Add to Home Screen command.

## Security

Dash assumes a trusted LAN. The server accepts forms from multiple local names,
and the production container can access the Docker socket. The Homelab page can
also send power actions to Docker and Proxmox.

Do not expose the current deployment to the public internet without adding
authentication, restricting trusted origins, and reviewing the mounted
credentials.

## Project history

See [CHANGELOG.md](CHANGELOG.md) for shipped changes grouped by date.
