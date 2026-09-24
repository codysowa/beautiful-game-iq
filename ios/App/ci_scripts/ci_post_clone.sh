#!/bin/sh
set -e

REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$PWD}"
cd "$REPO_ROOT"

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
