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
grep -R -q "Copy Lineup" "$ASSET_DIR"
grep -R -q "Copy From Previous Game" "$ASSET_DIR"
grep -R -q "Copy Entire Game" "$ASSET_DIR"
grep -R -q "Select time" "$ASSET_DIR"

echo "=== Verified iOS web bundle ==="
echo "Assets: $ASSET_DIR"
echo "Copy Lineup: present"
echo "Copy From Previous Game: present"
echo "Copy Entire Game: present"
echo "Select time: present"
