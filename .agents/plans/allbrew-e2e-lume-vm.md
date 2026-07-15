# allbrew E2E/real-world testing with Lume and Cua Driver — Plan

> **Goal:** Create a reproducible, script-driven macOS VM harness for allbrew E2E and real-world testing. The harness uses **Lume** for local Apple Silicon macOS VMs and optionally **Cua Driver** for future GUI automation. The primary automation path for the test suite is **SSH command execution inside the VM**, which is sufficient for running `allbrew`, `brew install`, and CLI assertions.

---

## 1. Background

The CUA project provides two relevant pieces of infrastructure:

- **Lume** (`trycua/cua/libs/lume`) — a CLI and framework for macOS/Linux VMs on Apple Silicon using Apple's Virtualization Framework.
- **Cua Driver** (`trycua/cua/libs/cua-driver`) — a background computer-use driver that speaks MCP over stdio and can drive native macOS apps.

There is no single CUA doc page that covers "Lume VM + Cua Driver for E2E testing," but the documented pieces compose cleanly:

1. Lume can create a headless macOS Tahoe VM from an IPSW with the `--unattended tahoe` preset, which creates the `lume`/`lume` account, enables SSH, enables auto-login, and disables sleep/screen locking.
2. Cua Driver can be installed inside the VM and run as a LaunchAgent daemon. It can be driven over an SSH-stdio bridge by a host MCP client (same proxy pattern documented for Windows over SSH).
3. For tests that only need command execution, `lume ssh <vm>` or direct SSH is enough.

---

## 2. Scope

### In scope

- One Lume VM named `allbrew-e2e` (configurable), created from the provided 26.5.2 IPSW.
- Bash wrapper scripts under `scripts/` for setup, SSH, test runs, snapshotting, and teardown.
- A committed config file (`scripts/e2e-vm-config.sh`) holding reproducible defaults that can be overridden by environment variables.
- Optional Cua Driver installation inside the VM so the same VM can later be reused for GUI/cask automation without rebuilding.

### Out of scope (for this plan)

- A fully automated host-side MCP bridge to Cua Driver. The bridge can be added later; this plan documents the manual command.
- GUI-based E2E assertions. The first implementation relies on SSH command output and `brew` exit codes.
- Checking the VM image into git. Only config files and scripts are committed.

---

## 3. VM specification

| Setting | Default | Override env var |
|---|---|---|
| VM name | `allbrew-e2e` | `ALLBREW_E2E_VM_NAME` |
| IPSW path | `/Users/tariqwest/Downloads/UniversalMac_26.5.2_25F84_Restore.ipsw` | `ALLBREW_E2E_IPSW` |
| CPU cores | `4` | `ALLBREW_E2E_CPU` |
| Memory | `16GB` | `ALLBREW_E2E_MEMORY` |
| Disk size | `100GB` | `ALLBREW_E2E_DISK` |
| Display | `1280x800` | `ALLBREW_E2E_DISPLAY` |
| Shared host dir | `/Users/tariqwest/Developer/allbrew` | `ALLBREW_E2E_SHARED_DIR` |
| VM user | `lume` | `ALLBREW_E2E_USER` |
| VM password | `lume` | `ALLBREW_E2E_PASSWORD` |

The defaults assume the repo is checked out at `/Users/tariqwest/Developer/allbrew` and the Tahoe IPSW is the 26.5.2 file already on disk.

---

## 4. Script inventory

All scripts live in `scripts/` and source `scripts/e2e-vm-config.sh` for defaults.

### 4.1 `scripts/e2e-vm-config.sh`

Sourced config file. Contains the table above as shell variables and helper functions such as `vm_ip()` and `vm_running()`.

```bash
#!/bin/bash
# shellcheck disable=SC2034
set -euo pipefail

ALLBREW_E2E_VM_NAME="${ALLBREW_E2E_VM_NAME:-allbrew-e2e}"
ALLBREW_E2E_IPSW="${ALLBREW_E2E_IPSW:-/Users/tariqwest/Downloads/UniversalMac_26.5.2_25F84_Restore.ipsw}"
ALLBREW_E2E_CPU="${ALLBREW_E2E_CPU:-4}"
ALLBREW_E2E_MEMORY="${ALLBREW_E2E_MEMORY:-16GB}"
ALLBREW_E2E_DISK="${ALLBREW_E2E_DISK:-100GB}"
ALLBREW_E2E_DISPLAY="${ALLBREW_E2E_DISPLAY:-1280x800}"
ALLBREW_E2E_SHARED_DIR="${ALLBREW_E2E_SHARED_DIR:-/Users/tariqwest/Developer/allbrew}"
ALLBREW_E2E_USER="${ALLBREW_E2E_USER:-lume}"
ALLBREW_E2E_PASSWORD="${ALLBREW_E2E_PASSWORD:-lume}"
ALLBREW_E2E_SSH_KEY="${ALLBREW_E2E_SSH_KEY:-$HOME/.ssh/allbrew_e2e_vm}"

ALLBREW_E2E_REPO_MOUNT="/Volumes/My Shared Files"

vm_exists() {
  lume get "$ALLBREW_E2E_VM_NAME" --format json >/dev/null 2>&1
}

vm_state() {
  lume get "$ALLBREW_E2E_VM_NAME" --format json 2>/dev/null \
    | jq -r '.[0].status // "missing"' 2>/dev/null \
    || echo "missing"
}

vm_running() {
  [[ "$(vm_state)" == "running" ]]
}

vm_ip() {
  lume get "$ALLBREW_E2E_VM_NAME" --format json 2>/dev/null \
    | jq -r '.[0].ipAddress // empty' 2>/dev/null
}

repo_mount_path() {
  printf '%s' "$ALLBREW_E2E_REPO_MOUNT"
}
```

### 4.2 `scripts/e2e-vm-setup.sh`

One-time (or idempotent) setup.

Responsibilities:
1. Check that Lume is installed; offer install command if not.
2. Check that the IPSW file exists.
3. Create the VM with `lume create` if it does not exist.
4. Start the VM headless.
5. Wait for SSH to become available.
6. Install Homebrew inside the VM.
7. Install Bun inside the VM.
8. Install allbrew dependencies and build (run `bun install` in the shared repo dir).
9. Optionally install Cua Driver when `--with-cuadriver` is passed.

Key command:

```bash
lume create "$ALLBREW_E2E_VM_NAME" \
  --ipsw "$ALLBREW_E2E_IPSW" \
  --unattended tahoe \
  --cpu "$ALLBREW_E2E_CPU" \
  --memory "$ALLBREW_E2E_MEMORY" \
  --disk-size "$ALLBREW_E2E_DISK" \
  --display "$ALLBREW_E2E_DISPLAY"
```

Start:

```bash
lume run --no-display "$ALLBREW_E2E_VM_NAME" \
  --shared-dir "$ALLBREW_E2E_SHARED_DIR"
```

### 4.3 `scripts/e2e-vm-ssh.sh`

Run an arbitrary command inside the VM via `lume ssh`, which is the simplest and most reliable path.

Usage:

```bash
scripts/e2e-vm-ssh.sh 'sw_vers && brew --version'
```

Implementation:

```bash
#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/e2e-vm-config.sh"
exec lume ssh "$ALLBREW_E2E_VM_NAME" -- "$@"
```

### 4.4 `scripts/e2e-vm-run-tests.sh`

Run the allbrew test suite inside the VM.

Responsibilities:
1. Ensure the VM is running.
2. Inside the VM, `cd` to the shared repo mount (`/Volumes/My Shared Files`).
3. Run `bun install` if `node_modules` is stale.
4. Run `bun run check`.
5. Run `bun run test` (mocked unit tests).
6. Optionally run `bun run test:int` and `E2E=1 bun run test:e2e` when flags are passed.

Usage:

```bash
scripts/e2e-vm-run-tests.sh --integration --e2e
```

### 4.5 `scripts/e2e-vm-clone.sh`

Create a disposable copy of the current VM before destructive tests.

Usage:

```bash
scripts/e2e-vm-clone.sh allbrew-e2e-dirty
```

Implementation stops the source VM, clones it, then restarts the original headless.

### 4.6 `scripts/e2e-vm-teardown.sh`

Stop or delete the VM.

Usage:

```bash
scripts/e2e-vm-teardown.sh --stop
scripts/e2e-vm-teardown.sh --delete
```

---

## 5. Optional Cua Driver install

When `scripts/e2e-vm-setup.sh --with-cuadriver` is used, the script runs inside the VM:

```bash
/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"
```

Then it writes a LaunchAgent plist so the driver daemon survives reboots:

```bash
cat > ~/Library/LaunchAgents/com.trycua.cua-driver.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
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
EOF
launchctl load ~/Library/LaunchAgents/com.trycua.cua-driver.plist
```

To enable GUI driving from a host MCP client later, create `scripts/cua-driver-vm-bridge.sh`:

```bash
#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/e2e-vm-config.sh"
VM_IP="$(vm_ip)"
exec ssh -q -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  "${ALLBREW_E2E_USER}@${VM_IP}" /Users/lume/.local/bin/cua-driver mcp
```

And register it:

```bash
claude mcp add --transport stdio cua-driver-vm -- scripts/cua-driver-vm-bridge.sh
```

> **Note:** The first TCC grant for Accessibility + Screen Recording requires a display boot and manual approval inside the VM. Plan for one interactive `lume run allbrew-e2e` session before using Cua Driver headlessly.

---

## 6. Test execution flow

Typical E2E run from the host:

```bash
# 1. One-time setup
scripts/e2e-vm-setup.sh

# 2. Snapshot before risky work
scripts/e2e-vm-clone.sh allbrew-e2e-clean

# 3. Run tests
scripts/e2e-vm-run-tests.sh --integration --e2e

# 4. Inspect failures interactively
scripts/e2e-vm-ssh.sh

# 5. Teardown
scripts/e2e-vm-teardown.sh --stop
```

---

## 7. File locations and git policy

| File | Path | In git? |
|---|---|---|
| Config defaults | `scripts/e2e-vm-config.sh` | Yes |
| Setup script | `scripts/e2e-vm-setup.sh` | Yes |
| SSH helper | `scripts/e2e-vm-ssh.sh` | Yes |
| Test runner | `scripts/e2e-vm-run-tests.sh` | Yes |
| Clone helper | `scripts/e2e-vm-clone.sh` | Yes |
| Teardown helper | `scripts/e2e-vm-teardown.sh` | Yes |
| Cua Driver bridge | `scripts/cua-driver-vm-bridge.sh` | Yes |
| VM disk/config | `~/.lume/` | **No** |
| IPSW image | `~/Downloads/` | **No** |
| Host-specific overrides | `.env` | **No** (already gitignored) |

---

## 8. Risks and caveats

- **TCC / Cua Driver:** Cua Driver cannot receive Accessibility and Screen Recording grants without an interactive display session the first time. This plan keeps Cua Driver optional and uses SSH for the test suite to avoid that friction.
- **VM creation time:** Creating a VM from an IPSW can take 10–30 minutes. The scripts should be idempotent so re-runs skip creation.
- **Lume version drift:** Lume defaults and presets change. Pin behavior via explicit flags (`--cpu`, `--memory`, `--disk-size`, `--display`, `--unattended tahoe`).
- **SSH auth:** `lume ssh` handles auth for the default `lume`/`lume` account. If direct SSH is used, copy a host SSH key into the VM or use `sshpass` for the default password.
- **Homebrew inside the VM:** The VM starts without Homebrew or Xcode CLI tools. The setup script installs them; first install can be slow.
- **Shared directory permissions:** Files written inside the VM into the shared directory may have ownership/permissions that differ from the host. Test output should be written to a VM-local temp dir and copied back via `lume ssh` if needed.

---

## 9. Verification checklist

- [ ] `bun run check` still passes (no TypeScript changes).
- [ ] All new shell scripts pass `shellcheck`.
- [ ] `scripts/e2e-vm-config.sh` can be sourced without errors.
- [ ] `scripts/e2e-vm-setup.sh` creates and starts the VM successfully.
- [ ] `scripts/e2e-vm-ssh.sh 'id -un'` returns `lume`.
- [ ] `scripts/e2e-vm-run-tests.sh` runs `bun run test` to completion inside the VM.
- [ ] `scripts/e2e-vm-clone.sh` produces a bootable copy.
- [ ] `scripts/e2e-vm-teardown.sh --delete` removes the VM.

---

## 10. Next steps

1. Implement the scripts listed in §4.
2. Update `.env.example` (or add a note in `AGENTS.md`) documenting the optional env overrides.
3. Run the verification checklist.
4. Consider adding a CI job that runs `scripts/e2e-vm-run-tests.sh` on a schedule or on PRs that touch generators.
