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
test -n "$(find "$ASSET_DIR" -type f -name '*.js' -print -quit)"

# Validate content from the current app. Do not assert labels from retired UI
# workflows: those strings are not part of the v2.0.0 app and caused CI to fail
# after the TypeScript/Vite build and Capacitor asset copy had already passed.
grep -R -q "Coach Sign In" "$ASSET_DIR"
grep -R -q "Our Goal" "$ASSET_DIR"
grep -R -q "Select time" "$ASSET_DIR"

echo "=== Verified iOS web bundle ==="
echo "Assets: $ASSET_DIR"
echo "Coach Sign In: present"
echo "Our Goal: present"
echo "Select time: present"
