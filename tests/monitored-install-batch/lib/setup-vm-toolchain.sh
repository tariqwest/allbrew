#!/bin/bash
# Persisted VM toolchain setup for allbrew cargo/dotnet source-build smoke tests.
# Run as the project user (th-allbrew) inside a Lume macOS VM.
# Idempotent: safe to re-run across VM hygiene cleanups and after VM recreation.

set -uo pipefail

# Project user defaults
: "${CARGO_HOME:=$HOME/.cargo}"
: "${RUSTUP_HOME:=$HOME/.rustup}"
CARGO_BIN="$CARGO_HOME/bin"

# Make cargo tools available in this shell; also put the Homebrew prefix on PATH
# when it is mounted, so `brew uninstall` can run during this setup.
export PATH="$CARGO_BIN:/opt/homebrew/bin:$PATH"
export CARGO_HOME
export RUSTUP_HOME

log() {
  echo "[vm-toolchain] $*"
}

# 1. Ensure the Homebrew prefix is mounted so `brew` works.
#    The batch harness normally does this, but the script must be self-sufficient.
HOMEBREW_MOUNT_POINT="/opt/homebrew"
if ! mount | grep -q " on ${HOMEBREW_MOUNT_POINT} "; then
  log "mounting Homebrew prefix at $HOMEBREW_MOUNT_POINT"
  sudo mkdir -p "$HOMEBREW_MOUNT_POINT"
  SPARSEBUNDLE=$(find "$HOME"/Library/LumeHomebrew -maxdepth 1 -name '*.sparsebundle' -print -quit 2>/dev/null)
  if [[ -z "$SPARSEBUNDLE" ]]; then
    SPARSEBUNDLE="$HOME/Library/LumeHomebrew/homebrew.sparsebundle"
  fi
  if [[ -e "$SPARSEBUNDLE" ]]; then
    sudo hdiutil attach "$SPARSEBUNDLE" -mountpoint "$HOMEBREW_MOUNT_POINT" -nobrowse -owners on 2>&1 || true
  fi
fi

if ! command -v brew >/dev/null 2>&1; then
  log "WARNING: brew not on PATH; skipping Homebrew rust/llvm uninstall"
else
  # 2. Uninstall Homebrew rust and llvm if they are present.
  #    --ignore-dependencies avoids pulling down the entire tree if the prefix is clean.
  for pkg in rust llvm; do
    if brew list "$pkg" >/dev/null 2>&1; then
      log "uninstalling Homebrew $pkg"
      brew uninstall --ignore-dependencies "$pkg" 2>&1 || true
    else
      log "Homebrew $pkg not installed"
    fi
  done
fi

# 3. Install rustup if missing.
if [[ -x "$CARGO_BIN/rustup" ]]; then
  log "rustup already installed: $CARGO_BIN/rustup"
else
  log "installing rustup"
  mkdir -p "$CARGO_HOME" "$RUSTUP_HOME"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
    sh -s -- -y --default-toolchain stable --no-modify-path
fi

# 4. Install/ensure the stable toolchain.
"$CARGO_BIN/rustup" default stable
"$CARGO_BIN/rustup" component add rust-src 2>/dev/null || true

# 5. Configure cargo to use macOS native clang and limit build parallelism.
mkdir -p "$CARGO_HOME"

# Discover the host architecture for the rust target.
TARGET=$("$CARGO_BIN/rustc" -vV 2>/dev/null | awk '/host:/ { print $2 }')

cat > "$CARGO_HOME/config.toml" <<EOF
[build]
jobs = 2

[env]
CC = "/usr/bin/clang"
CXX = "/usr/bin/clang++"
CFLAGS = "-Wno-everything"
CXXFLAGS = "-Wno-everything"

[target.${TARGET}]
linker = "/usr/bin/clang"
EOF

# 6. Persist environment across login and non-login shells.
ensure_env_line() {
  local file="$1"
  local line="$2"
  touch "$file"
  if ! grep -qxF "$line" "$file" 2>/dev/null; then
    log "appending to $file"
    printf '\n# allbrew VM toolchain: rustup + native clang\n%s\n' "$line" >> "$file"
  fi
}

ensure_env_rc() {
  local file="$1"
  local line="$2"
  touch "$file"
  if ! grep -qxF "$line" "$file" 2>/dev/null; then
    log "appending to $file"
    printf '\n# allbrew VM toolchain: rustup + native clang\n%s\n' "$line" >> "$file"
  fi
}

ensure_env_rc "$HOME/.bashrc" 'source "$HOME/.cargo/env" 2>/dev/null || true'
ensure_env_rc "$HOME/.zshrc" 'source "$HOME/.cargo/env" 2>/dev/null || true'

ensure_env_line "$HOME/.zshenv" 'export RUSTUP_HOME="$HOME/.rustup"'
ensure_env_line "$HOME/.zshenv" 'export CARGO_HOME="$HOME/.cargo"'
ensure_env_line "$HOME/.zshenv" 'export PATH="$HOME/.cargo/bin:$PATH"'
ensure_env_line "$HOME/.bash_profile" 'export RUSTUP_HOME="$HOME/.rustup"'
ensure_env_line "$HOME/.bash_profile" 'export CARGO_HOME="$HOME/.cargo"'
ensure_env_line "$HOME/.bash_profile" 'export PATH="$HOME/.cargo/bin:$PATH"'

# 7. Verify.
log "--- verification ---"
"$CARGO_BIN/rustc" --version
"$CARGO_BIN/cargo" --version
/usr/bin/clang --version | head -n1
log "--- done ---"
