#!/bin/bash
set -e

echo "🚀 Starting DoraMetrics Release Info Script (Shell Version)"

# ---------------------
# 🧱 PostgreSQL Setup
# ---------------------
DB_HOST="${DORAMETRICS_DB_HOST}"
DB_PORT="${DORAMETRICS_DB_PORT:-5432}"
DB_USER="${DORAMETRICS_DB_USER}"
DB_PASSWORD="${DORAMETRICS_DB_PASSWORD}"
DB_NAME="${DORAMETRICS_DB_NAME}"

export PGPASSWORD="$DB_PASSWORD"

PSQL_CMD="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1"

# ---------------------
# 🔍 Utility Functions
# ---------------------

is_git_repo() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1
}

get_repo_name_from_git() {
  local repo_url
  repo_url=$(git config --get remote.origin.url 2>/dev/null || echo "")

  if [[ "$repo_url" =~ ([^/:]+/[^/.]+)(\.git)?$ ]]; then
    echo "${BASH_REMATCH[1]}"
  else
    echo "unknown-repo"
  fi
}

extract_all_tickets() {
  local message="$1"
  echo "$message" \
    | grep -oiE '\b[A-Z]+-[0-9]+\b' \
    | tr 'a-z' 'A-Z' \
    | sort -u \
    | paste -sd ", " - \
    || echo ""
}

# ---------------------
# 🧠 Git / Pipeline Metadata
# ---------------------

get_metadata() {
  ENVIRONMENT="${ENVIRONMENT:-dev}"

  TAG="no-tag"
  RELEASE_DATE="$(date -Iseconds)"
  COMMIT_MESSAGE="${CP_COMMIT_MESSAGE:-}"
  PROJECT_NAME="${DORAMETRICS_PROJECT_NAME:-${CP_REPO:-unknown-repo}}"

  if is_git_repo; then
    echo "🔍 Git repository detected"

    COMMIT_MESSAGE=$(git log -1 --format=%B 2>/dev/null || echo "")

    if TAG=$(git describe --tags --abbrev=0 2>/dev/null); then
      RELEASE_DATE=$(git log -1 --format=%aI "$TAG" 2>/dev/null || date -Iseconds)
    else
      echo "⚠️ No Git tag found, using fallback"
      TAG="no-tag"
    fi

    PROJECT_NAME=$(get_repo_name_from_git)
  else
    echo "🚧 No Git repo detected (CI/CD mode)"

    COMMIT_ID="${CP_COMMIT_ID:-}"
    if [[ "$COMMIT_ID" =~ ^[a-fA-F0-9]{40}$ ]]; then
      TAG="no-tag"
    else
      TAG="${COMMIT_ID:-no-tag}"
    fi
  fi
}

# ---------------------
# 🧩 Main Store Logic
# ---------------------

store_git_tag_and_jira_issues() {
  get_metadata

  TICKETS=$(extract_all_tickets "$COMMIT_MESSAGE")
  [[ -z "$TICKETS" ]] && TICKETS="N/A"

  echo "🏷️ Tag: $TAG"
  echo "📅 Release Date: $RELEASE_DATE"
  echo "🎫 Tickets: $TICKETS"
  echo "📦 Project Name: $PROJECT_NAME"
  echo "🌍 Environment: $ENVIRONMENT"

  echo "🧱 Ensuring table exists..."

  $PSQL_CMD <<EOF
CREATE TABLE IF NOT EXISTS dora_release_info (
  id SERIAL PRIMARY KEY,
  tag VARCHAR(100) NOT NULL,
  ticket TEXT NOT NULL,
  release_date TIMESTAMPTZ NOT NULL,
  project_name VARCHAR(255),
  environment VARCHAR(50),
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tag, environment, ticket)
);
EOF

  echo "💾 Inserting / updating release info..."

  $PSQL_CMD <<EOF
INSERT INTO dora_release_info (
  tag,
  ticket,
  release_date,
  project_name,
  environment
)
VALUES (
  '$TAG',
  '$TICKETS',
  '$RELEASE_DATE',
  '$PROJECT_NAME',
  '$ENVIRONMENT'
)
ON CONFLICT (tag, environment, ticket)
DO UPDATE SET
  release_date = EXCLUDED.release_date,
  project_name = EXCLUDED.project_name;
EOF

  echo "✨ Release info saved successfully!"
}

# ---------------------
# 🚀 Execute
# ---------------------
store_git_tag_and_jira_issues

echo "🔌 Script completed"
