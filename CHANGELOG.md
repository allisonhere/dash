# Changelog

Dash does not use version tags yet. Entries are grouped by the date they shipped
to `master`.

## Unreleased

### Added

- Added a link check in Settings that requests every bookmark and reports the
  broken, unreachable, blocked, and moved ones. Results stream in over
  server-sent events as each link is checked. LAN hosts are checked without TLS
  verification, and only redirects that leave the host are reported.
- Added unit tests for link-check classification, summarizing, and sorting.
- Added a card-corner setting in Settings → Appearance. Corners stay sharp by
  default; switching to round applies a radius (2-32px, with presets) to cards,
  panels, and controls across every page. The choice is stored per instance in
  `appearance.json` alongside the theme selection.

### Changed

- Replaced the generated Svelte README with setup, testing, data, deployment,
  PWA, and security documentation.
- Added this changelog from the repository's commit history.

## 2026-08-09

### Added

- Added a PWA manifest, local app icons, static-asset service worker, and mobile
  bottom navigation.
- Added versioned backup download and validated restore in Settings. Backups
  include bookmarks, feeds, groups, and theme selection while excluding
  homelab credentials.
- Added an isolated Docker Compose test stack on port 3940 with its own data
  volume and no Docker socket.
- Added unit tests for backup parsing and restore validation.
- Added the Azure Log Analytics icon mapping for the My Analytics bookmark.

### Changed

- Raised the bookmark pin limit from four to eight.
- Replaced the default Svelte favicon with the Dashboard Icons app mark.
- Fixed the small-screen shell layout with a dedicated bottom navigation bar,
  safe-area spacing, and desktop-only header navigation.

## 2026-08-04

### Added

- Added read-only NUT UPS collection for status, charge, runtime, load, model,
  voltage, and power.
- Added the Jarvis UPS section to Homelab below Proxmox and Docker.

### Fixed

- Switched the production container to host networking so it can reach the NUT
  service on the Docker host.

## 2026-07-19

### Added

- Added live Homelab updates over server-sent events.
- Added guarded start, stop, restart, shutdown, and reboot actions for Docker
  containers and Proxmox guests.

### Fixed

- Kept filtered bookmark groups and empty states in sync with searches.
- Preserved unsaved Settings edits when another group updates.
- Gave adopted bookmark groups stable IDs so renaming and color changes persist.

## 2026-07-12

### Added

- Added bookmark group colors and a category selector to the bookmark editor.
- Added Settings for creating, renaming, recoloring, and deleting bookmark
  groups.
- Added deterministic fallback colors when `groups.json` is missing.

### Changed

- Updated the deployment script output and verification flow.

## 2026-07-05

### Added

- Added recent bookmarks based on visit time and use count.

## 2026-07-04

### Added

- Added GHCR image publishing for Portainer and remote Compose updates.

### Changed

- Compressed Proxmox guests and Docker containers into denser status rows.
- Restored node gauges and tightened the Homelab layout.
- Added comment links and search clear controls.

## 2026-07-02

### Added

- Created the SvelteKit dashboard with bookmarks, news, Homelab, and built-in
  themes.
- Added automatic bookmark icons from Homarr Dashboard Icons.
- Added the initial Docker Compose and deployment documentation.

### Fixed

- Allowed the LAN deployment to accept form submissions across its supported
  hostnames and IP addresses.
- Preserved readable fallback text when bookmark icons fail to load.
