#!/usr/bin/env bash
set -euo pipefail

# Amplify post-deploy hook
# This script runs after an Amplify deployment completes.

log() { printf "%s %s\n" "[$(date '+%Y-%m-%dT%H:%M:%S%z')]" "$*"; }

log "Post-deploy hook started."
log "Environment: $AMPLIFY_ENV"
log "Branch: $AMPLIFY_BRANCH"
log "Repo root: $REPO_ROOT"

log "Post-deploy hook finished."