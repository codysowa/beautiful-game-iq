#!/bin/sh
set -e

REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$PWD}"
cd "$REPO_ROOT"

echo "=== Beautiful Game IQ: prepare web bundle ==="
echo "Build: ${CI_BUILD_NUMBER:-unknown}"
echo "Action: ${CI_XCODEBUILD_ACTION:-unknown}"
echo "Project: ${CI_XCODE_PROJECT:-unknown}"
echo "Scheme: ${CI_XCODE_SCHEME:-unknown}"

npm ci
npm run build

rm -rf "$REPO_ROOT/ios/App/App/public"
cp -R "$REPO_ROOT/dist" "$REPO_ROOT/ios/App/App/public"

JS_FILE=$(find "$REPO_ROOT/ios/App/App/public/assets" -maxdepth 1 -name 'index-*.js' -type f | head -n 1)

test -n "$JS_FILE"
grep -q "Copy Lineup" "$JS_FILE"
grep -q "Select time" "$JS_FILE"

echo "=== Verified bundled web app ==="
echo "JS bundle: $JS_FILE"
echo "Copy Lineup: present"
echo "Select time: present"
