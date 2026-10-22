#!/bin/sh
set -eu

REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$PWD}"
cd "$REPO_ROOT"

# Xcode Cloud's macOS images may already provide Node. If not, install it
# and fail with a clear diagnostic if the package manager is unavailable.
if ! command -v node >/dev/null 2>&1; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "ERROR: Node.js and Homebrew are both unavailable in this Xcode Cloud environment."
    exit 1
  fi
  brew install node
fi

echo "Node: $(node --version)"
echo "npm: $(npm --version)"
echo "Repository: $REPO_ROOT"

echo "Installing dependencies from package-lock.json..."
npm ci

echo "Building the web app..."
npm run build

echo "Copying web assets into the iOS Capacitor project..."
npx cap copy ios

ASSET_DIR="$REPO_ROOT/ios/App/App/public"
if [ ! -f "$ASSET_DIR/index.html" ]; then
  echo "ERROR: Capacitor output missing index.html at $ASSET_DIR"
  echo "Contents of ios/App/App, if present:"
  ls -la "$REPO_ROOT/ios/App/App" || true
  exit 1
fi

echo "Verified Capacitor entry point: $ASSET_DIR/index.html"
echo "Xcode Cloud post-clone preparation succeeded."
