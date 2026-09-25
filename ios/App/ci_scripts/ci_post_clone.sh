#!/bin/sh
set -e

REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$PWD}"
cd "$REPO_ROOT"

if ! command -v node >/dev/null 2>&1; then
  brew install node
fi
export PATH="$(brew --prefix)/bin:$PATH"

echo "Node: $(node --version)"
echo "npm: $(npm --version)"

npm ci

rm -rf ios/App/App/public

# The iOS packaging step needs the Vite bundle, not TypeScript's standalone
# project check. The latter is currently returning exit 2 in Xcode Cloud and
# prevents the web bundle from ever being generated.
npx vite build

cp -R dist ios/App/App/public

JS_FILE=$(find ios/App/App/public/assets -maxdepth 1 -name 'index-*.js' -type f | head -n 1)
test -n "$JS_FILE"
grep -q "Copy Lineup" "$JS_FILE"
grep -q "Select time" "$JS_FILE"

echo "Verified fresh web bundle: $JS_FILE"

python3 - <<'PY'
from pathlib import Path

p = Path("ios/App/CapApp-SPM/Package.swift")
s = p.read_text()
s = "\n".join(
    line for line in s.splitlines()
    if "CapacitorCommunityAdmob" not in line
) + "\n"
p.write_text(s)
PY
