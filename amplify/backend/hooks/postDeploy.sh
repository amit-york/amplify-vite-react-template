
#!/usr/bin/env bash
set -euo pipefail

log() { printf "%s %s\n" "[$(date '+%Y-%m-%dT%H:%M:%S%z')]" "$*"; }

# Resolve repo root from this script's location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

log "Post-deploy hook started."
log "Environment: $AMPLIFY_ENV"
log "Branch: $AMPLIFY_BRANCH"
log "Repo root: $REPO_ROOT"

# Change directory to your project root (Amplify checks out your repo here)
cd "$REPO_ROOT"

# Fetch git metadata: latest tag, commit, and deployment timestamp
if command -v git >/dev/null 2>&1; then
  git fetch --tags --force >/dev/null 2>&1 || true
  GIT_TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"
  if [ -z "${GIT_TAG:-}" ]; then
    GIT_TAG="v0.0.0"
  fi
  GIT_COMMIT_SHORT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
else
  GIT_TAG="v0.0.0"
  GIT_COMMIT_SHORT="unknown"
fi
DEPLOYED_AT_UTC="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

log "Git tag: $GIT_TAG"
log "Commit: $GIT_COMMIT_SHORT"
log "Deployed at: $DEPLOYED_AT_UTC (UTC)"

# Write a runtime-readable version file for the app
mkdir -p "$REPO_ROOT/public"
cat > "$REPO_ROOT/public/version.json" <<EOF
{ "tag": "$GIT_TAG", "commit": "$GIT_COMMIT_SHORT", "deployedAt": "$DEPLOYED_AT_UTC", "env": "${AMPLIFY_ENV:-unknown}", "branch": "${AMPLIFY_BRANCH:-unknown}" }
EOF
log "Wrote release metadata to public/version.json"

# Ensure dependencies exist (Amplify cache might be clean)
if [ ! -d "node_modules" ]; then
  log "Installing dependencies..."
  npm ci --omit=dev
fi

# 🏃 Run your npm command first
log "Running npm run dora..."
npm run dora || log "⚠️ npm run dora failed, continuing with hook."

log "Post-deploy hook finished with success."
