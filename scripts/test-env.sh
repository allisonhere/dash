#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose --env-file "$PROJECT_DIR/.env.test" -f "$PROJECT_DIR/compose.test.yaml")
ACTION="${1:-up}"
TEST_PORT="${DASH_TEST_PORT:-$(sed -n 's/^DASH_TEST_PORT=//p' "$PROJECT_DIR/.env.test")}"
TEST_URL="http://localhost:${TEST_PORT:-3940}"

case "$ACTION" in
	up)
		"${COMPOSE[@]}" up -d --build
		printf 'Waiting for Dash test environment'
		for _ in {1..30}; do
			if curl -fsS "$TEST_URL/bookmarks" >/dev/null 2>&1; then
				printf '\nDash test environment is ready: %s\n' "$TEST_URL"
				exit 0
			fi
			printf '.'
			sleep 1
		done
		printf '\nDash test environment did not become ready.\n' >&2
		"${COMPOSE[@]}" ps
		exit 1
		;;
	down)
		"${COMPOSE[@]}" down
		;;
	status)
		"${COMPOSE[@]}" ps
		;;
	logs)
		"${COMPOSE[@]}" logs -f --tail=100 dash-test
		;;
	*)
		printf 'Usage: npm run test:env -- [up|down|status|logs]\n' >&2
		exit 2
		;;
esac
