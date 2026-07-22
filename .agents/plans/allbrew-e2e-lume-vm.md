# allbrew E2E/real-world testing with Lume and Cua Driver — Plan

> **Status:** **Superseded.** The script-based approach described in this plan has been replaced by the [`lume-macos-testing-harness`](../../../lume-macos-testing-harness) integration. allbrew defines its VM test suite in [`test-suite.ts`](../../test-suite.ts) and is invoked via `bun run vm:*` (documented in [`AGENTS.md`](../../AGENTS.md)). The legacy `scripts/e2e-vm-*.sh` files have been removed. This plan is retained for historical context; see [`allbrew-user-lifecycle-test-plan.md`](./allbrew-user-lifecycle-test-plan.md) for current lifecycle testing priorities.
>
> **Goal (historical):** Create a reproducible, script-driven macOS VM harness for allbrew E2E and real-world testing. The harness uses **Lume** for local Apple Silicon macOS VMs and optionally **Cua Driver** for future GUI automation. The primary automation path for the test suite is **SSH command execution inside the VM**, which is sufficient for running `allbrew`, `brew install`, and CLI assertions.

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
| VM name | `allbrew-e2e` | `LUME_VM_NAME` |
| IPSW path | `/Users/tariqwest/Downloads/UniversalMac_26.5.2_25F84_Restore.ipsw` | `LUME_IPSW` |
| CPU cores | `4` | `LUME_VM_CPU` |
| Memory | `4GB` | `LUME_VM_MEMORY` |
| Disk size | `65GB` | `LUME_VM_DISK` |
| Display | `1280x800` | `LUME_VM_DISPLAY` |
| Shared host dir | `/Users/tariqwest/Developer/allbrew` | `LUME_SHARED_DIR` |
| VM user | `lume` | `LUME_VM_USER` |
| VM password | `lume` | `LUME_VM_PASSWORD` |

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

LUME_VM_NAME="${LUME_VM_NAME:-allbrew-e2e}"
LUME_IPSW="${LUME_IPSW:-/Users/tariqwest/Downloads/UniversalMac_26.5.2_25F84_Restore.ipsw}"
LUME_VM_CPU="${LUME_VM_CPU:-4}"
LUME_VM_MEMORY="${LUME_VM_MEMORY:-4GB}"
LUME_VM_DISK="${LUME_VM_DISK:-65GB}"
LUME_VM_DISPLAY="${LUME_VM_DISPLAY:-1280x800}"
LUME_SHARED_DIR="${LUME_SHARED_DIR:-/Users/tariqwest/Developer/allbrew}"
LUME_VM_USER="${LUME_VM_USER:-lume}"
LUME_VM_PASSWORD="${LUME_VM_PASSWORD:-lume}"
LUME_VM_SSH_KEY="${LUME_VM_SSH_KEY:-$HOME/.ssh/allbrew_e2e_vm}"

LUME_VM_REPO_MOUNT="/Volumes/My Shared Files"

vm_exists() {
  lume get "$LUME_VM_NAME" --format json >/dev/null 2>&1
}

vm_state() {
  lume get "$LUME_VM_NAME" --format json 2>/dev/null \
    | jq -r '.[0].status // "missing"' 2>/dev/null \
    || echo "missing"
}

vm_running() {
  [[ "$(vm_state)" == "running" ]]
}

vm_ip() {
  lume get "$LUME_VM_NAME" --format json 2>/dev/null \
    | jq -r '.[0].ipAddress // empty' 2>/dev/null
}

repo_mount_path() {
  printf '%s' "$LUME_VM_REPO_MOUNT"
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
lume create "$LUME_VM_NAME" \
  --ipsw "$LUME_IPSW" \
  --unattended tahoe \
  --cpu "$LUME_VM_CPU" \
  --memory "$LUME_VM_MEMORY" \
  --disk-size "$LUME_VM_DISK" \
  --display "$LUME_VM_DISPLAY"
```

Start:

```bash
lume run --no-display "$LUME_VM_NAME" \
  --shared-dir "$LUME_SHARED_DIR"
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
exec lume ssh "$LUME_VM_NAME" -- "$@"
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

To enable GUI driving from a host MCP client, use the harness's `cua` subcommand (replaces the former `scripts/cua-driver-vm-bridge.sh`):

```bash
bun run vm:setup                 # creates the project user + provisions Cua Driver prereqs
./node_modules/.bin/lume-test-harness cua install    # install Cua Driver for the project user
./node_modules/.bin/lume-test-harness cua status     # check install/running state
./node_modules/.bin/lume-test-harness cua grant      # request TCC grants (needs interactive GUI session)
```

And register the MCP bridge:

```bash
claude mcp add --transport stdio cua-driver-vm -- lume-test-harness cua bridge
```

The harness `cua bridge` command connects as the project user (not the VM admin) and supports both local and remote Lume hosts. The legacy `scripts/cua-driver-vm-bridge.sh` has been removed.

> **Note:** The first TCC grant for Accessibility + Screen Recording requires a display boot and manual approval inside the VM. Plan for one interactive `lume run allbrew-e2e` session before using Cua Driver headlessly.

---

## 6. Test execution flow

Typical E2E run from the host:

```bash
# 1. One-time setup
scripts/e2e-vm-setup.sh

# 2. Snapshot before risky work
scripts/e2e-vm-clone.sh allbrew-e2e-clean

# 3. Run tests (auto-captures readout + test log)
scripts/e2e-vm-run-tests.sh --integration --e2e

# 4. Run tests + reset VM for next run
scripts/e2e-vm-run-tests.sh --e2e --reset

# 5. Inspect results
cat tests/e2e-runs/latest/readout.txt
cat tests/e2e-runs/latest/test-output.log

# 6. Inspect failures interactively
scripts/e2e-vm-ssh.sh

# 7. Teardown
scripts/e2e-vm-teardown.sh --stop
```

### Run records

Each test run produces a timestamped record under `tests/e2e-runs/<timestamp>/`:

| File | Contents |
|------|----------|
| `readout.txt` | Full post-test state: allbrew config/manifests, Homebrew taps/formulae/casks, MAS apps, Setapp, tap repo git state, /Applications, disk usage, test results summary |
| `test-output.log` | Captured stdout/stderr from the test run |
| `metadata.json` | Machine-readable run metadata (timestamp, VM name, git SHA, branch) |
| `reset.log` | Log of the reset operation (if reset was run) |

A `latest` symlink points to the most recent run. Records persist across resets.

---

## 6a. Post-test readout (`scripts/e2e-vm-readout.sh`)

Captures the full state of the VM after a test run. Run automatically by `e2e-vm-run-tests.sh`, or manually:

```bash
scripts/e2e-vm-readout.sh                    # readout only
scripts/e2e-vm-readout.sh /path/to/test.log  # include test results summary
```

Sections captured:

1. **System info** — macOS version, arch, CPU, RAM, disk
2. **Running processes** — brew/allbrew/node/bun processes
3. **allbrew state** — version, config, manifests, global link
4. **Homebrew state** — version, taps, installed formulae, installed casks, cellar, caskroom, cache
5. **MAS apps** — `mas list` output
6. **Setapp apps** — Setapp directory listing
7. **/Applications** — GUI apps from any source
8. **Tap repo git state** — git log, status, diff, Formula/Casks contents
9. **Host repo git state** — branch, recent commits, status
10. **Test results summary** — parsed pass/fail counts from vitest output

---

## 6b. VM reset (`scripts/e2e-vm-reset.sh`)

Returns the VM to a virgin state for the next run. Preserves the run record.

```bash
scripts/e2e-vm-reset.sh                    # full reset (keeps Homebrew/Bun/mas CLI)
scripts/e2e-vm-reset.sh --nuclear          # also uninstall Homebrew/Bun/mas CLI
scripts/e2e-vm-reset.sh --readout test.log # readout then reset
```

Reset steps (default):

1. Uninstall all casks
2. Uninstall all formulae (two passes for dependencies)
3. Uninstall allbrew formula
4. Remove custom taps (preserves homebrew/core, cask, bundle, services)
5. Uninstall MAS apps
6. Remove Setapp + setapp-cli
7. Remove allbrew config and manifests (`~/.config/allbrew/`)
8. Remove tap checkout directories (`~/homebrew-*`)
9. Remove allbrew global link
10. Clean Homebrew cache (`brew cleanup --prune=all`)
11. Post-reset verification (shows what remains)

Nuclear mode additionally:

12. Uninstall mas CLI
13. Uninstall Homebrew itself
14. Remove Bun
15. Clean shell config remnants

---

## 7. File locations and git policy

| File | Path | In git? |
|---|---|---|
| Config defaults | `scripts/e2e-vm-config.sh` | Yes |
| Setup script | `scripts/e2e-vm-setup.sh` | Yes |
| SSH helper | `scripts/e2e-vm-ssh.sh` | Yes |
| Test runner | `scripts/e2e-vm-run-tests.sh` | Yes |
| Post-test readout | `scripts/e2e-vm-readout.sh` | Yes |
| VM reset | `scripts/e2e-vm-reset.sh` | Yes |
| Clone helper | `scripts/e2e-vm-clone.sh` | Yes |
| Teardown helper | `scripts/e2e-vm-teardown.sh` | Yes |
| Cua Driver bridge | `lume-test-harness cua bridge` (harness SDK) | Yes |
| VM disk/config | `~/.lume/` | **No** |
| IPSW image | `~/Downloads/` | **No** |
| Host-specific overrides | `.env` | **No** (already gitignored) |
| Run records | `tests/e2e-runs/` | **No** |

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
