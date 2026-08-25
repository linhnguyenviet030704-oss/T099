#!/usr/bin/env bash
# Cross-platform Python launcher for AI log hooks.
#
# On Windows, `python`/`python3` on PATH are often just "App execution
# alias" stubs (%LOCALAPPDATA%\Microsoft\WindowsApps\python3.exe) that
# print an install prompt and exit nonzero when no Python is installed
# system-wide — but `command -v` still reports them as found, since they
# are real files. Blindly trusting `command -v` and `exec`-ing the first
# match silently breaks every hook on machines in that state. So each
# candidate is actually run (not just located) before being committed to.
#
# `py` (the official launcher, installed by python.org's installer) does
# not have this failure mode, so it is tried first. Falls back to this
# repo's own .venv and common Windows install locations if none of the
# PATH candidates work.
#
# Designed to be sourced or called as: bash scripts/_pyrun.sh <script> [args...]
#
# Exits 0 silently if no working Python is found — hooks must never block
# the AI tool.
set -u

_works() {
  # $1 = interpreter, $2 = first arg (e.g. "-3") or "" if none
  if [ -n "$2" ]; then
    "$1" "$2" -c "import sys" >/dev/null 2>&1
  else
    "$1" -c "import sys" >/dev/null 2>&1
  fi
}

PY=""
if command -v py >/dev/null 2>&1 && _works py -3; then
  PY="py -3"
elif command -v python3 >/dev/null 2>&1 && _works python3 ""; then
  PY=python3
elif command -v python >/dev/null 2>&1 && _works python ""; then
  PY=python
else
  script_dir="$(dirname "$0")"
  shopt -s nullglob 2>/dev/null || true
  for cand in \
    "$script_dir/../.venv/Scripts/python.exe" \
    "$script_dir/../.venv/bin/python" \
    /c/Users/*/AppData/Local/Programs/Python/Python*/python.exe \
    "/c/Program Files/Python"*/python.exe \
    "/c/Program Files (x86)/Python"*/python.exe \
    /c/Python*/python.exe; do
    if [ -x "$cand" ] && _works "$cand" ""; then PY="$cand"; break; fi
  done
  shopt -u nullglob 2>/dev/null || true
  [ -n "$PY" ] || exit 0
fi

# shellcheck disable=SC2086
exec $PY "$@"
