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

# Copy the built web bundle into the location packaged by the native iOS app.
# Do not use cap sync here: native plugin registration is intentionally handled
# separately, and UI-copy assertions break whenever labels change in the redesign.
npx cap copy ios

IOS_PUBLIC_DIR="$REPO_ROOT/ios/App/App/public"
ASSET_DIR="$IOS_PUBLIC_DIR/assets"

test -s "$IOS_PUBLIC_DIR/index.html"
test -d "$ASSET_DIR"
find "$ASSET_DIR" -maxdepth 1 -type f -name '*.js' | grep -q .

echo "=== Verified iOS web bundle ==="
echo "Index: $IOS_PUBLIC_DIR/index.html"
echo "JavaScript assets: present"
