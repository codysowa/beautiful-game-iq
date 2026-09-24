#!/bin/sh
set -e

cd "$CI_PRIMARY_REPOSITORY_PATH"

npm ci

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
