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

JS_FILE=$(find "$REPO_ROOT/ios/App/App/public/assets" -maxdepth 1 -name 'index-*.js' -type f | head -n 1)

test -n "$JS_FILE"
grep -q "Copy Lineup" "$JS_FILE"
grep -q "Copy From Previous Game" "$JS_FILE"
grep -q "Copy Entire Game" "$JS_FILE"
grep -q "Select time" "$JS_FILE"

echo "=== Verified iOS web bundle ==="
echo "Bundle: $JS_FILE"
echo "Copy Lineup: present"
echo "Copy From Previous Game: present"
echo "Copy Entire Game: present"
echo "Select time: present"
