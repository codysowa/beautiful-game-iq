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

echo "Installing JavaScript dependencies..."
npm ci

echo "Building web app..."
npm run build

echo "Copying built web app into Capacitor iOS project..."
npx cap copy ios

ASSET_DIR="$REPO_ROOT/ios/App/App/public"
if [ ! -d "$ASSET_DIR" ] || [ ! -f "$ASSET_DIR/index.html" ]; then
  echo "ERROR: Capacitor web bundle is missing or incomplete: $ASSET_DIR"
  echo "Expected index.html after 'npx cap copy ios'."
  exit 1
fi

echo "Verified Capacitor iOS bundle at: $ASSET_DIR"
echo "Xcode Cloud post-clone preparation succeeded."
