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

# Validate the generated Capacitor bundle without asserting obsolete UI copy.
# Those labels changed during the redesign; checking them made valid builds fail.
test -s "$REPO_ROOT/ios/App/App/public/index.html"
test -d "$ASSET_DIR"
find "$ASSET_DIR" -maxdepth 1 -type f -name '*.js' | grep -q .

echo "=== Verified iOS web bundle ==="
echo "Index: $REPO_ROOT/ios/App/App/public/index.html"
echo "JavaScript assets: present"
