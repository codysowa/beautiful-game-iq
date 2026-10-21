#!/bin/sh
set -e

REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$PWD}"
cd "$REPO_ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found; installing with Homebrew..."
  brew install node
fi

export PATH="$(brew --prefix)/bin:$PATH"

echo "Node: $(node --version)"
echo "npm: $(npm --version)"

npm ci
npm run build

# Regenerate the web assets in the exact native location Xcode packages.
npx cap copy ios

ASSET_DIR="$REPO_ROOT/ios/App/App/public/assets"

test -d "$ASSET_DIR"
grep -R -q "Reuse a previous lineup" "$ASSET_DIR"
grep -R -q "Choose a previous game" "$ASSET_DIR"
grep -R -q "Select a previous game first." "$ASSET_DIR"
grep -R -q "Select time" "$ASSET_DIR"

echo "=== Verified iOS web bundle ==="
echo "Assets: $ASSET_DIR"
echo "Previous lineup reuse: present"
echo "Previous game selector: present"
echo "Previous game copy handler: present"
echo "Select time: present"
