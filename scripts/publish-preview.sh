#!/usr/bin/env bash
# Publishes the site to GitHub (isaacvj1/actiph-website) and turns on GitHub
# Pages, then prints the preview link. Run it yourself from the VS Code terminal:
#
#   ./scripts/publish-preview.sh            # public repo (free plan)
#   ./scripts/publish-preview.sh private    # private repo (needs GitHub Pro/Team)
#
# Safe to run again: later runs just push the latest commits.
set -euo pipefail
cd "$(dirname "$0")/.."

# Keep a copy of everything this prints, so problems can be diagnosed afterwards.
LOG=".publish-preview.log"
exec > >(tee "$LOG") 2>&1
trap 'echo "FAILED at line $LINENO. Full output saved in $PWD/$LOG"' ERR
echo "Publishing preview $(date '+%Y-%m-%d %H:%M:%S')"

REPO="isaacvj1/actiph-website"
VISIBILITY="${1:-public}"
URL="https://isaacvj1.github.io/actiph-website/"

if gh repo view "$REPO" >/dev/null 2>&1; then
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$REPO.git"
  git push -u origin main
else
  gh repo create "$REPO" "--$VISIBILITY" \
    --description "ActiPH x HYROX UK campaign site (VJ Salomone Consumer Lines)" \
    --source . --remote origin --push
fi

if ! gh api "repos/$REPO/pages" >/dev/null 2>&1; then
  gh api -X POST "repos/$REPO/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null
fi

echo "Waiting for GitHub Pages to build (usually under 2 minutes)..."
for _ in $(seq 1 36); do
  status="$(gh api "repos/$REPO/pages/builds/latest" --jq .status 2>/dev/null || echo pending)"
  if [ "$status" = "built" ]; then
    echo "Live: $URL"
    exit 0
  fi
  if [ "$status" = "errored" ]; then
    echo "GitHub Pages build failed. Details: https://github.com/$REPO/actions" >&2
    exit 1
  fi
  sleep 5
done
echo "Still building. Try $URL in a minute, or check https://github.com/$REPO/actions"
