#!/bin/sh
set -e

REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$PWD}"
cd "$REPO_ROOT"

echo "=== Beautiful Game IQ web sync ==="
echo "CI build: ${CI_BUILD_NUMBER:-unknown}"
echo "Xcode action: ${CI_XCODEBUILD_ACTION:-unknown}"
echo "Repo: $REPO_ROOT"

npm run build

rm -rf ios/App/App/public
cp -R dist ios/App/App/public

JS_FILE=$(find ios/App/App/public/assets -maxdepth 1 -name 'index-*.js' -type f | head -n 1)
CSS_FILE=$(find ios/App/App/public/assets -maxdepth 1 -name 'index-*.css' -type f | head -n 1)

test -n "$JS_FILE"
test -n "$CSS_FILE"

grep -q "Copy Lineup" "$JS_FILE"
grep -q "Select time" "$JS_FILE"

echo "=== Web bundle verified ==="
echo "JS: $JS_FILE"
echo "CSS: $CSS_FILE"
echo "Contains Copy Lineup: yes"
echo "Contains Select time: yes"
