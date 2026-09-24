#!/bin/sh
set -e

REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$PWD}"
cd "$REPO_ROOT"

# Xcode Cloud does not guarantee Node/npm is preinstalled.
# Homebrew is available in the Xcode Cloud environment, so install Node only when needed.
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found; installing with Homebrew..."
  brew install node
fi

export PATH="$(brew --prefix)/bin:$PATH"

echo "Node: $(node --version)"
echo "npm: $(npm --version)"

npm ci

rm -rf ios/App/App/public
npm run build
cp -R dist ios/App/App/public

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
