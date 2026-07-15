#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=e2e-vm-config.sh
source "$SCRIPT_DIR/e2e-vm-config.sh"

WITH_CUADRIVER=false
for arg in "$@"; do
  case "$arg" in
    --with-cuadriver) WITH_CUADRIVER=true ;;
    --help|-h)
      echo "Usage: $(basename "$0") [--with-cuadriver]"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: $(basename "$0") [--with-cuadriver]" >&2
      exit 1
      ;;
  esac
done

log() { echo "[e2e-vm-setup] $*"; }
error() { echo "[e2e-vm-setup] ERROR: $*" >&2; exit 1; }

# 1. Check Lume
command -v lume >/dev/null 2>&1 || error "lume not found. Install with:\n  /bin/bash -c \"\$(curl -fsSL https://cua.ai/lume/install.sh)\""

# 2. Check IPSW
[[ -f "$ALLBREW_E2E_IPSW" ]] || error "IPSW not found: $ALLBREW_E2E_IPSW"

# 3. Create VM if missing
if ! vm_exists; then
  log "Creating VM '$ALLBREW_E2E_VM_NAME' from $ALLBREW_E2E_IPSW"
  lume create "$ALLBREW_E2E_VM_NAME" \
    --ipsw "$ALLBREW_E2E_IPSW" \
    --unattended tahoe \
    --cpu "$ALLBREW_E2E_CPU" \
    --memory "$ALLBREW_E2E_MEMORY" \
    --disk-size "$ALLBREW_E2E_DISK" \
    --display "$ALLBREW_E2E_DISPLAY"
else
  log "VM '$ALLBREW_E2E_VM_NAME' already exists"
fi

# 4. Start VM headless if not running
if ! vm_running; then
  log "Starting VM '$ALLBREW_E2E_VM_NAME' headless with shared dir: $ALLBREW_E2E_SHARED_DIR"
  nohup lume run --no-display "$ALLBREW_E2E_VM_NAME" --shared-dir "$ALLBREW_E2E_SHARED_DIR" \
    >/tmp/lume-run-"$ALLBREW_E2E_VM_NAME".log 2>&1 &
  disown
  log "Waiting for VM to boot..."
else
  log "VM '$ALLBREW_E2E_VM_NAME' is already running"
fi

# 5. Wait for SSH
for i in {1..90}; do
  if lume ssh "$ALLBREW_E2E_VM_NAME" 'true' >/dev/null 2>&1; then
    log "SSH is available"
    break
  fi
  if [[ $i -eq 90 ]]; then
    error "Timed out waiting for VM SSH"
  fi
  sleep 5
done

# 6. Configure passwordless sudo
log "Configuring passwordless sudo for $ALLBREW_E2E_USER"
lume ssh "$ALLBREW_E2E_VM_NAME" --timeout 60 "
  echo '$ALLBREW_E2E_PASSWORD' | sudo -S sh -c '
    echo \"$ALLBREW_E2E_USER ALL=(ALL) NOPASSWD: ALL\" > /etc/sudoers.d/$ALLBREW_E2E_USER
    chmod 440 /etc/sudoers.d/$ALLBREW_E2E_USER
  '
"

# 7. Install Homebrew if missing
log "Ensuring Homebrew is installed"
if lume ssh "$ALLBREW_E2E_VM_NAME" 'command -v brew >/dev/null 2>&1'; then
  log "Homebrew already installed"
else
  lume ssh "$ALLBREW_E2E_VM_NAME" --timeout 0 '
    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  '
fi

# 8. Install Bun if missing
log "Ensuring Bun is installed"
if lume ssh "$ALLBREW_E2E_VM_NAME" '[[ -d ~/.bun/bin ]]'; then
  log "Bun already installed"
else
  lume ssh "$ALLBREW_E2E_VM_NAME" --timeout 0 'curl -fsSL https://bun.sh/install | bash'
fi

# 9. Install allbrew dependencies in the shared repo
REPO_MOUNT="$(repo_mount_path)"
log "Installing allbrew dependencies in $REPO_MOUNT"
lume ssh "$ALLBREW_E2E_VM_NAME" --timeout 0 '
  export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.bun/bin:$PATH"
  cd "'"$REPO_MOUNT"'"
  bun install
'

# 10. Generate SSH key for direct host -> VM access
if [[ ! -f "$ALLBREW_E2E_SSH_KEY" ]]; then
  log "Generating SSH key for direct VM access: $ALLBREW_E2E_SSH_KEY"
  mkdir -p "$(dirname "$ALLBREW_E2E_SSH_KEY")"
  ssh-keygen -t ed25519 -f "$ALLBREW_E2E_SSH_KEY" -N "" -C "allbrew-e2e-vm"
fi

log "Copying SSH public key to VM"
KEY_B64="$(base64 < "$ALLBREW_E2E_SSH_KEY.pub")"
lume ssh "$ALLBREW_E2E_VM_NAME" --timeout 60 "
  mkdir -p ~/.ssh && chmod 700 ~/.ssh
  echo '$KEY_B64' | base64 -d > ~/.ssh/authorized_keys
  chmod 600 ~/.ssh/authorized_keys
"

# 11. Optionally install Cua Driver
if $WITH_CUADRIVER; then
  log "Installing Cua Driver inside VM"
  lume ssh "$ALLBREW_E2E_VM_NAME" --timeout 0 '
    /bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"
  '

  log "Registering Cua Driver LaunchAgent"
  lume ssh "$ALLBREW_E2E_VM_NAME" --timeout 60 "
    mkdir -p ~/Library/LaunchAgents
    cat > ~/Library/LaunchAgents/com.trycua.cua-driver.plist <<'PLIST'
<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\">
<dict>
  <key>Label</key>
  <string>com.trycua.cua-driver</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Applications/CuaDriver.app/Contents/MacOS/cua-driver</string>
    <string>serve</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
PLIST
    launchctl load ~/Library/LaunchAgents/com.trycua.cua-driver.plist
  "
  log "Cua Driver installed. Grant Accessibility/Screen Recording by booting with display once and running 'cua-driver permissions grant'."
fi

log "Setup complete. VM '$ALLBREW_E2E_VM_NAME' is running."
log "Run commands with: $SCRIPT_DIR/e2e-vm-ssh.sh <command>"
