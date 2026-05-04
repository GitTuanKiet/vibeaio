#!/usr/bin/env bash
set -euo pipefail
R="${ROOT:-$HOME}"
D="${VIBEAIO_DIR:-$R/.vibeaio}"
U="${VIBEAIO_REPO_URL:-https://github.com/GitTuanKiet/vibeaio.git}"
S="$(pwd)/.claude"

command -v git >/dev/null 2>&1 || { echo "vibeaio setup: need git" >&2; exit 3; }

if [ -d "$D/.git" ]; then
  git -C "$D" pull --ff-only >/dev/null 2>&1 || true
elif [ -e "$D" ]; then
  echo "vibeaio setup: $D exists and is not a clone" >&2
  exit 1
else
  mkdir -p "$(dirname "$D")"
  git clone --depth 1 "$U" "$D"
fi

mkdir -p "$(dirname "$S")"
[ ! -e "$S" ] || [ -L "$S" ] || { echo "vibeaio setup: $S is not a symlink" >&2; exit 1; }
ln -snf "$D" "$S"

command -v bun >/dev/null 2>&1 || { echo "vibeaio setup: need bun (https://bun.sh/install)" >&2; exit 2; }
cd "$D" && { bun install --frozen-lockfile || bun install; }
