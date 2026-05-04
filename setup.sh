#!/usr/bin/env bash
set -euo pipefail

# Expand a leading ~ so VIBEAIO_DIR/ROOT work when exported from dotfiles.
_expand_tilde() {
  case "${1-}" in
    "~") printf '%s\n' "$HOME" ;;
    "~"/*) printf '%s\n' "${HOME}${1#\~}" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

R="$(_expand_tilde "${ROOT:-$HOME}")"
D="$(_expand_tilde "${VIBEAIO_DIR:-$R/.vibeaio}")"
U="${VIBEAIO_REPO_URL:-https://github.com/GitTuanKiet/vibeaio.git}"
S="$(pwd)/.claude"

command -v git >/dev/null 2>&1 || { echo "vibeaio setup: need git" >&2; exit 3; }

if [ -d "$D/.git" ]; then
  if ! git -C "$D" pull --ff-only >/dev/null 2>&1; then
    echo "vibeaio setup: warning: git pull failed in $D (offline or diverged?)" >&2
  fi
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

D="$(cd "$D" && pwd -P)"
if [ ! -f "$D/package.json" ]; then
  echo "vibeaio setup: no package.json in $D — remove that folder or set VIBEAIO_DIR, then re-run." >&2
  exit 4
fi

cd "$D"
if [ -f bun.lock ]; then
  bun install --frozen-lockfile
else
  bun install
fi
