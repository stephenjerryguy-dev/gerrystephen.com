#!/usr/bin/env bash
# Trigger the JerryQuant Live Agent reliably via GitHub's workflow_dispatch
# API — instead of relying on GitHub's flaky built-in cron.
#
# Usage:
#   GITHUB_DISPATCH_TOKEN=github_pat_xxx ./trigger_live_agent.sh [plan|scan|execute]
#
# Token: a GitHub fine-grained Personal Access Token scoped to the
# stephenjerryguy-dev/gerrystephen.com repo with "Actions" = Read and write.
# (Settings -> Developer settings -> Fine-grained tokens.)
#
# Point an external scheduler (e.g. cron-job.org with timezone America/New_York,
# which sidesteps the UTC/DST problem) at this same API call, or run this from a
# local cron/launchd job. phase defaults to "scan".
set -euo pipefail

PHASE="${1:-scan}"
REPO="stephenjerryguy-dev/gerrystephen.com"
WORKFLOW="jerryquant-live-agent.yml"

: "${GITHUB_DISPATCH_TOKEN:?Set GITHUB_DISPATCH_TOKEN to a fine-grained PAT with Actions: read and write}"

case "$PHASE" in
  plan|scan|execute) ;;
  *) echo "phase must be plan, scan, or execute (got: $PHASE)" >&2; exit 2 ;;
esac

curl -fsS -X POST \
  -H "Authorization: Bearer ${GITHUB_DISPATCH_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches" \
  -d "{\"ref\":\"main\",\"inputs\":{\"phase\":\"${PHASE}\"}}"

echo "Dispatched JerryQuant Live Agent (phase=${PHASE})."
