#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASH_BRANCH="${DASH_BRANCH:-master}"
DASH_REMOTE="${DASH_REMOTE:-origin}"
DASH_DEPLOY_HOST="${DASH_DEPLOY_HOST:-jarvis}"
DASH_REMOTE_DIR="${DASH_REMOTE_DIR:-~/dash}"
DASH_URL="${DASH_URL:-http://192.168.86.74:3939}"
DEFAULT_COMMIT_MESSAGE="${DASH_COMMIT_MESSAGE:-chore: deploy dash}"

STEP_START=0
TOTAL_START=0

print_header() {
  if [ -t 1 ] && command -v clear >/dev/null 2>&1; then
    clear
  fi
  echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║${NC}              ${BOLD}${CYAN}Dash Docker Deploy${NC}                         ${BLUE}║${NC}"
  echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

print_step() {
  local step=$1
  local total=$2
  local msg=$3
  STEP_START=$(date +%s)
  echo ""
  echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${CYAN}[$step/$total]${NC} ${BOLD}$msg${NC}"
  echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_substep() { echo -e "  ${DIM}→${NC} $1"; }

print_success() {
  local elapsed=$(($(date +%s) - STEP_START))
  echo -e "  ${GREEN}✓${NC} $1 ${DIM}(${elapsed}s)${NC}"
}

print_error() { echo -e "  ${RED}✗${NC} $1" >&2; }
print_warning() { echo -e "  ${YELLOW}⚠${NC} $1"; }
print_info() { echo -e "  ${BLUE}ℹ${NC} $1"; }

format_time() {
  local seconds=$1
  if [ "$seconds" -ge 60 ]; then
    echo "$((seconds / 60))m $((seconds % 60))s"
  else
    echo "${seconds}s"
  fi
}

run_cmd() {
  echo -e "  ${DIM}$*${NC}"
  "$@"
}

require_command() {
  local command_name=$1
  if ! command -v "$command_name" >/dev/null 2>&1; then
    print_error "Missing required command: $command_name"
    return 1
  fi
}

current_branch() {
  git -C "$PROJECT_DIR" branch --show-current
}

dirty_count() {
  git -C "$PROJECT_DIR" status --porcelain | wc -l | tr -d ' '
}

remote_commit() {
  git -C "$PROJECT_DIR" rev-parse --short "$DASH_REMOTE/$DASH_BRANCH" 2>/dev/null || echo "unknown"
}

local_commit() {
  git -C "$PROJECT_DIR" rev-parse --short HEAD
}

ensure_repo() {
  if ! git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    print_error "$PROJECT_DIR is not a Git repository"
    return 1
  fi
}

ensure_branch() {
  local branch
  branch=$(current_branch)
  if [ "$branch" != "$DASH_BRANCH" ]; then
    print_error "Expected branch $DASH_BRANCH but current branch is $branch"
    print_info "Override with DASH_BRANCH=$branch if this is intentional"
    return 1
  fi
}

status_report() {
  ensure_repo
  local branch changes upstream
  branch=$(current_branch)
  changes=$(dirty_count)
  upstream=$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo "none")

  echo -e "  ${BOLD}Project:${NC}  $PROJECT_DIR"
  echo -e "  ${BOLD}Branch:${NC}   $branch"
  echo -e "  ${BOLD}Upstream:${NC} $upstream"
  echo -e "  ${BOLD}Remote:${NC}   $DASH_REMOTE/$DASH_BRANCH"
  echo -e "  ${BOLD}Commit:${NC}   local $(local_commit), remote $(remote_commit)"
  if [ "$changes" -gt 0 ]; then
    echo -e "  ${BOLD}Git:${NC}      ${YELLOW}$changes uncommitted change(s)${NC}"
  else
    echo -e "  ${BOLD}Git:${NC}      ${GREEN}clean${NC}"
  fi
  echo -e "  ${BOLD}Host:${NC}     $DASH_DEPLOY_HOST"
  echo -e "  ${BOLD}Path:${NC}     $DASH_REMOTE_DIR"
  echo -e "  ${BOLD}URL:${NC}      $DASH_URL"
  echo ""
}

preflight() {
  print_substep "Checking required commands..."
  require_command git
  require_command npm
  require_command docker
  require_command ssh
  require_command curl
  ensure_repo
  ensure_branch
  print_success "Required commands are available"

  print_substep "Running Svelte checks..."
  (cd "$PROJECT_DIR" && run_cmd npm run check)
  print_success "Svelte checks passed"

  print_substep "Building production bundle..."
  (cd "$PROJECT_DIR" && run_cmd npm run build)
  print_success "Production build passed"

  print_substep "Validating Docker Compose config..."
  (cd "$PROJECT_DIR" && run_cmd docker compose config --quiet)
  print_success "Docker Compose config is valid"
}

commit_changes() {
  ensure_repo
  ensure_branch

  if [ "$(dirty_count)" -eq 0 ]; then
    print_info "No changes to commit"
    return 0
  fi

  git -C "$PROJECT_DIR" status --short
  echo ""

  local message
  if [ -t 0 ]; then
    read -r -p "  Commit message [$DEFAULT_COMMIT_MESSAGE]: " message
    message=${message:-$DEFAULT_COMMIT_MESSAGE}
  else
    message="$DEFAULT_COMMIT_MESSAGE"
  fi

  print_substep "Staging repo changes..."
  git -C "$PROJECT_DIR" add -A

  if git -C "$PROJECT_DIR" diff --cached --quiet; then
    print_info "No staged changes after git add"
    return 0
  fi

  print_substep "Committing changes..."
  git -C "$PROJECT_DIR" commit -m "$message"
  print_success "Committed changes"
}

push_to_github() {
  ensure_repo
  ensure_branch
  print_substep "Fetching $DASH_REMOTE/$DASH_BRANCH..."
  git -C "$PROJECT_DIR" fetch "$DASH_REMOTE" "$DASH_BRANCH"

  print_substep "Checking for non-fast-forward push risk..."
  local local_sha remote_sha base_sha
  local_sha=$(git -C "$PROJECT_DIR" rev-parse HEAD)
  remote_sha=$(git -C "$PROJECT_DIR" rev-parse "$DASH_REMOTE/$DASH_BRANCH")
  base_sha=$(git -C "$PROJECT_DIR" merge-base HEAD "$DASH_REMOTE/$DASH_BRANCH")

  if [ "$local_sha" = "$remote_sha" ]; then
    print_info "GitHub already has $(local_commit)"
    return 0
  fi

  if [ "$base_sha" != "$remote_sha" ]; then
    print_error "$DASH_REMOTE/$DASH_BRANCH has commits this checkout does not have"
    print_info "Pull/rebase first, then rerun deploy"
    return 1
  fi

  print_substep "Pushing $DASH_BRANCH to GitHub..."
  git -C "$PROJECT_DIR" push "$DASH_REMOTE" "$DASH_BRANCH"
  print_success "Pushed $(local_commit) to $DASH_REMOTE/$DASH_BRANCH"
}

remote_deploy() {
  print_substep "Deploying on $DASH_DEPLOY_HOST..."
  ssh "$DASH_DEPLOY_HOST" "set -euo pipefail; cd $DASH_REMOTE_DIR; git pull --ff-only $DASH_REMOTE $DASH_BRANCH; docker compose up -d --build; docker compose ps"
  print_success "Remote Docker Compose deploy finished"
}

verify_url() {
  print_substep "Checking $DASH_URL..."
  local attempt
  for attempt in {1..12}; do
    if curl -fsS --max-time 5 "$DASH_URL" >/dev/null; then
      print_success "$DASH_URL responded"
      return 0
    fi
    sleep 2
  done

  print_error "$DASH_URL did not respond after 12 attempts"
  return 1
}

run_status() {
  print_header
  status_report
}

run_check() {
  print_header
  print_step 1 1 "Local preflight"
  preflight
}

run_commit() {
  print_header
  print_step 1 1 "Commit changes"
  commit_changes
}

run_push() {
  print_header
  print_step 1 1 "Push to GitHub"
  push_to_github
}

run_deploy() {
  print_header
  print_step 1 1 "Deploy Docker on $DASH_DEPLOY_HOST"
  remote_deploy
}

run_verify() {
  print_header
  print_step 1 1 "Verify deployed dashboard"
  verify_url
}

run_full() {
  TOTAL_START=$(date +%s)
  print_header

  print_step 1 5 "Local preflight"
  preflight

  print_step 2 5 "Commit changes"
  commit_changes

  print_step 3 5 "Push to GitHub"
  push_to_github

  print_step 4 5 "Deploy Docker on $DASH_DEPLOY_HOST"
  remote_deploy

  print_step 5 5 "Verify deployed dashboard"
  verify_url

  local total_time
  total_time=$(($(date +%s) - TOTAL_START))
  echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${GREEN}  ✓ Dash deploy complete${NC} ${DIM}($(format_time "$total_time"))${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

show_menu() {
  while true; do
    print_header
    status_report
    echo -e "  ${BOLD}${CYAN}Actions${NC}"
    echo -e "  ${DIM}─────────────────────────────${NC}"
    echo "   1) Status"
    echo "   2) Local preflight"
    echo "   3) Commit changes"
    echo "   4) Push to GitHub"
    echo "   5) Deploy Docker on $DASH_DEPLOY_HOST"
    echo "   6) Verify $DASH_URL"
    echo -e "   7) ${GREEN}Full deploy (recommended)${NC}"
    echo ""
    echo "   0) Exit"
    echo ""
    read -r -p "  Choose [0-7]: " choice

    case "$choice" in
      1) run_status ;;
      2) run_check ;;
      3) run_commit ;;
      4) run_push ;;
      5) run_deploy ;;
      6) run_verify ;;
      7) run_full ;;
      0)
        echo -e "\n  ${DIM}Bye.${NC}\n"
        exit 0
        ;;
      *) print_error "Invalid choice" ;;
    esac

    echo ""
    read -r -p "  Press Enter to continue..." _
  done
}

usage() {
  cat <<USAGE
Dash Docker deploy

Usage:
  ./deploy.sh [status|check|commit|push|deploy|verify|full]

Environment overrides:
  DASH_BRANCH       Git branch to push and deploy       (default: master)
  DASH_REMOTE       Git remote name used by deploy      (default: origin)
  DASH_DEPLOY_HOST  SSH host for the Docker server      (default: jarvis)
  DASH_REMOTE_DIR   Repo path on the Docker server      (default: ~/dash)
  DASH_URL          URL to verify after deploy          (default: http://192.168.86.74:3939)
  DASH_COMMIT_MESSAGE Default non-interactive message   (default: chore: deploy dash)
USAGE
}

main() {
  local action="${1:-menu}"

  case "$action" in
    menu) show_menu ;;
    status) run_status ;;
    check) run_check ;;
    commit) run_commit ;;
    push) run_push ;;
    deploy) run_deploy ;;
    verify) run_verify ;;
    full) run_full ;;
    -h|--help|help) usage ;;
    *)
      usage
      echo ""
      print_error "Unknown action: $action"
      exit 2
      ;;
  esac
}

main "$@"
