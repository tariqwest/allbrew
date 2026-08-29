---
name: vm-homeserver-setup
description: Provision or recreate the remote homeserver Lume VM (vm-homeserver-macos-testing) over ssh homeserver-app, handling IPSW sync, resource constraints, and external storage. Includes alternate path for VZ host-key Code=-9 when plain SSH create fails (Aqua console + launchctl asuser). References vm-local-setup for shared VM lifecycle steps. Use when the user asks to "setup homeserver vm", "recreate vm-homeserver-macos-testing", "provision remote lume vm", "sync ipsw to homeserver", or "prepare homeserver for batch".
---

# Homeserver VM Setup (Remote Lume over SSH)

Remote-specific companion to [vm-local-setup](../vm-local-setup/SKILL.md). That skill defines the generic 7-step Lume lifecycle (create → ssh verify → `th-allbrew` → stop → set → clone → run). This skill adds **only the remote/homeserver deltas** and delegates the shared steps back to it.

## When to use which

- **Local twin VMs** (`vm-local-macos-testing-1/2`, 50G, 4 CPU/6GB → 2/4GB): follow `vm-local-setup` directly on this host.
- **Remote single VM** (`vm-homeserver-macos-testing`, `app-user@homeserver.local` via `homeserver-app`): follow this skill — it wraps the same 7 steps with SSH, resource, and storage adjustments.

## Remote invariants (verified 2026-08-11/12)

- **Host**: `homeserver.local` (`192.168.50.100`), `Darwin 25.5.0`, 8 GB RAM (`hw.memsize 8589934592`, `hw.ncpu 8`), `macOS 26.5.2 25F84` host OS. `lume` binary at `~/.local/bin/lume` via `~/.local/share/lume/lume.app`.
- **Lume version skew**: local is `0.5.3`, remote was `0.3.16` → `0.5.3` after `lume update --apply`. Always run `lume update --apply` on remote before `tahoe` unattended create — `0.3.16` supports `tahoe` but bundle format drift causes clone drift.
- **Current VM**: `vm-homeserver-macos-testing` (`2 CPU/4GB/65G`, `1280x800`, `192.168.64.5`, `home` storage at `~/.lume`). Single VM, not twin — batch concurrency on remote is 1 endpoint vs local’s 2.
- **Disk layout**: internal `disk3s1` (`/System/Volumes/Data`) has ~`19Gi Avail` (91% used) — **insufficient for a new 50G `disk.img`**. External APFS `disk5s1` at `/Users/Shared/ExternalDrive` has `477Gi Avail` (`1%` used). Use it for VMs.
- **IPSW layout**: remote had `~/Downloads/UniversalMac_26.5.2_25F84_Restore.ipsw` (18G). Local `26.6` (`25G72`, 18G, `Zip archive`) is newer — Option 1a is to rsync `26.6` to remote for parity.
- **Batch role**: remote is `LUME_REMOTE_ENABLED=true` endpoint (`homeserver`); local twins are `LUME_REMOTE_ENABLED=false`. Harness `TH_HOMEBREW_PREFIX_ENABLED=false` applies to both (see `vm-local-setup` × `TH_HOMEBREW_PREFIX_ENABLED` appendix).

## Preflight (over `ssh homeserver-app`)

```bash
ssh homeserver-app "hostname; whoami; sw_vers | head -3; lume --version; lume ls; df -h ~/.lume; df -h /Users/Shared/ExternalDrive | head -5"
ssh homeserver-app "lume config storage list"  # expect home only on first run
ssh homeserver-app "ls -lh ~/Downloads/*.ipsw; ls -lh /Users/Shared/ExternalDrive/*.ipsw 2>&1 | head"
```

**SSH config** (from `~/.ssh/config`):

```
Host homeserver-app
  HostName homeserver.local
  User app-user
  IdentityFile ~/.ssh/id_server509
  IdentitiesOnly yes
  IdentityAgent none
```

All remote `lume` invocations must be `ssh homeserver-app "lume ..."` (same as `LUME_REMOTE_HOST=app-user@homeserver.local` for harness).

## Step A — Update lume on remote

```bash
ssh homeserver-app "lume update --apply; lume --version"
# Expected: 0.3.16 → 0.5.3, LaunchAgent reloaded at /Users/app-user/Library/LaunchAgents/com.trycua.lume_daemon.plist
# Failure mode: curl to get.lume.cua.ai may DNS-fail; `lume check-update` reports "Update available: 0.5.3"
```

## Step B — External storage for VMs (one-time)

Remote internal `19Gi` cannot hold `50G` `disk.img`. Create and register external location:

```bash
ssh homeserver-app "mkdir -p /Users/Shared/ExternalDrive/lume-vms && lume config storage add external /Users/Shared/ExternalDrive/lume-vms && lume config storage list"
# Expect: external: /Users/Shared/ExternalDrive/lume-vms, home: ~/.lume (default)
# Verify: df -h /Users/Shared/ExternalDrive  # 477Gi Avail
```

All subsequent `lume create/clone/set` must pass `--storage external` (or `--storage home` to keep old location). Harness `TH_HOMEBREW_PREFIX_ENABLED=false` does not affect this — it is a `lume` storage location, not a sparsebundle.

## Step C — IPSW sync (Option 1a: local 26.6 → remote, newer OS)

Reference: local is `26.6 25G72` at `/Volumes/EXTBAK2/os-images/UniversalMac_26.6_25G72_Restore.ipsw` (exfat NTFS via `disk5s1` on local). Remote has `26.5.2 25F84`. Option 1a chooses `26.6` for parity.

**Choice matrix:**

| Option | Source | Dest on remote | Time | When |
|--------|--------|----------------|------|------|
| **1a (chosen)** | `/Volumes/EXTBAK2/.../26.6` | `/Users/Shared/ExternalDrive/UniversalMac_26.6_25G72_Restore.ipsw` | ~6-9 min @ ~85-100 MB/s over `192.168.50.x` GigE, 18G | Newer OS, matches local |
| 1b | same | `~/Downloads/26.6` | same + keeps `home` but fills 19Gi internal | Avoid — fills `home` |
| 2 | SMB mount `EXTBAK2` | `/Volumes/EXTBAK2` on remote via `mount_smbfs //tariqwest@<local-ip>/EXTBAK2` | instant mount, but 2× slower `lume create` and breaks if local sleeps | Fallback if rsync blocked |

**1a commands (from local):**

```bash
# Verify local IPSW
ls -lh /Volumes/EXTBAK2/os-images/UniversalMac_26.6_25G72_Restore.ipsw  # 18G
file /Volumes/EXTBAK2/os-images/UniversalMac_26.6_25G72_Restore.ipsw  # Zip archive

# Rsync to external (resumable, preserves perms, --partial survives interrupt)
rsync -avP --progress /Volumes/EXTBAK2/os-images/UniversalMac_26.6_25G72_Restore.ipsw \
  app-user@homeserver.local:/Users/Shared/ExternalDrive/

# Poll on remote (dotfile .UniversalMac...1yVE5N* while in-flight, 18G when done)
ssh homeserver-app "ls -lh /Users/Shared/ExternalDrive/*.ipsw; du -sh /Users/Shared/ExternalDrive; ps aux | grep rsync | head"
# When final: /Users/Shared/ExternalDrive/UniversalMac_26.6_25G72_Restore.ipsw  18G
# Optional verify: ssh homeserver-app "shasum -a 256 /Users/Shared/ExternalDrive/UniversalMac_26.6_25G72_Restore.ipsw" # slow — 18G
```

**SMB alternative (1a fallback):**

```bash
# On local: System Settings → Sharing → File Sharing → share /Volumes/EXTBAK2 as EXTBAK2
ssh homeserver-app "sudo mkdir -p /Volumes/EXTBAK2 && sudo mount_smbfs //tariqwest@192.168.50.10/EXTBAK2 /Volumes/EXTBAK2 && ls -lh /Volumes/EXTBAK2/os-images/*.ipsw"
# Then: --ipsw /Volumes/EXTBAK2/os-images/UniversalMac_26.6_25G72_Restore.ipsw
```

## Step D — Delete and recreate vm-homeserver-macos-testing (resource-constrained)

**Constraint:** homeserver has 8 GB host RAM — **first-time setup: 4 CPU / 4 GB** (user directive 2026-08-12; local twin uses `4 CPU/6GB`), **future runs: 2 CPU / 3.5 GB** to leave host headroom (8 GB − 3.5 GB = 4.5 GB for host + batch overhead). Do not use local’s `4 CPU/6GB → 2/4GB` two-phase.

**Exact recreation (after IPSW at /Users/Shared/ExternalDrive/...):**

```bash
# Stop existing (lume stop may return 130 — use owner kill if needed)
ssh homeserver-app "lume ls; lume stop vm-homeserver-macos-testing; sleep 3; lume ls"
# If still running (ps shows lume run vm-homeserver-macos-testing):
ssh homeserver-app "kill -9 \$(pgrep -f 'lume run vm-homeserver-macos-testing' | head -1) ; sleep 3; lume ls"
# Do not use sudo pkill — requires tty password and is refused; owner kill -9 suffices

# Delete (may need to clear stale --no-display pid 94952 left from prior runs)
ssh homeserver-app "ps aux | grep -E 'lume run.*vm-homeserver' | grep -v grep; kill -9 \$(pgrep -f 'lume run vm-homeserver-macos-testing' | head -1) 2>/dev/null; lume delete vm-homeserver-macos-testing --force 2>&1; lume delete vm-homeserver-macos-testing --force --storage external 2>&1; echo DEL:\$?; lume ls; ls -la ~/.lume/ 2>&1 | head -20; ls -la /Users/Shared/ExternalDrive/lume-vms/ 2>&1 | head -20"

# Create — FIRST SETUP: 4 CPU / 4GB / 50G on external, tahoe unattended (matches local first-setup CPU, but 4GB not 6GB for 8GB host)
ssh homeserver-app "lume create vm-homeserver-macos-testing \
  --ipsw /Users/Shared/ExternalDrive/UniversalMac_26.6_25G72_Restore.ipsw \
  --unattended tahoe --cpu 4 --memory 4GB --disk-size 50GB --storage external 2>&1"
# Duration: ~4 min install (progress 0→100%, 78-79% stalls ~90s is normal) + offline unattended (~60s SSH health 60×5s)
# Logs: /tmp/lume_daemon.log on remote; VNC ports auto-assigned (e.g. 60007)
# On failure with leftover UUID VM (e.g. 275CF18D-...), delete it: lume delete 275CF18D-... --force; rm -rf ~/.lume/275CF18D-...


# After first-setup verification (ssh + th-allbrew), SCALE DOWN for future runs:
ssh homeserver-app "lume stop vm-homeserver-macos-testing --storage external; lume set vm-homeserver-macos-testing --cpu 2 --memory 3584MB --storage external; lume get vm-homeserver-macos-testing --format json | python3 -m json.tool | head -30"
# 3584MB = 3.5 GB (leaves 4.5 GB host headroom vs 4GB leaves 4GB). Verify: cpuCount 2, memorySize 3758096384
```

**Post-create — delegate to vm-local-setup steps 2-7, adapted:**

```bash
# 2 — SSH verify (lume/lume defaults on --unattended) — still at 4CPU/4GB first-setup
ssh homeserver-app "lume run vm-homeserver-macos-testing --display none --detach --storage external; sleep 5; lume ls --format json | python3 -m json.tool | head -40"
ssh homeserver-app "lume ssh vm-homeserver-macos-testing --storage external 'whoami; sw_vers; dscl . list /Users | head -20'"
# expect lume, 26.6 25G72, cpu 4

# 3 — th-allbrew (same as local, but via ssh wrapper) — do this BEFORE scaling down so sysadminctl has max CPU
ssh homeserver-app "lume ssh vm-homeserver-macos-testing --storage external 'echo lume | sudo -S sysadminctl -addUser th-allbrew -fullName \"th-allbrew\" -password th-allbrew -admin'"
# benign Error:-14120 + IOServiceMatching warning; verify:
ssh homeserver-app "lume ssh vm-homeserver-macos-testing --storage external 'id th-allbrew; dscl . list /Users | grep th-allbrew'"
ssh homeserver-app "lume ssh vm-homeserver-macos-testing --storage external --user th-allbrew --password th-allbrew 'whoami; pwd'"

# 4 — stop before scale-down
ssh homeserver-app "lume stop vm-homeserver-macos-testing --storage external; sleep 3; lume ls --storage external"
# Must be stopped before lume set

# 5 — SCALE DOWN for future runs: 4CPU/4GB → 2CPU/3.5GB (3584MB)
ssh homeserver-app "lume set vm-homeserver-macos-testing --cpu 2 --memory 3584MB --storage external; lume get vm-homeserver-macos-testing --format json | python3 -m json.tool | head -30"
# Verify: cpuCount 2, memorySize 3758096384 (3.5 GB). Leaves 4.5 GB host headroom.

# 6 — clone only if twin endpoint needed (both will be 2CPU/3.5GB after set)
ssh homeserver-app "lume clone vm-homeserver-macos-testing vm-homeserver-macos-testing-2 --source-storage external --dest-storage external"
# Optional: keep single VM as normal remote endpoint; twin mirrors local-1/2

# 7 — run (single VM; or twin staggered 60s as on local) — at 2CPU/3.5GB
ssh homeserver-app "lume run vm-homeserver-macos-testing --display none --detach --storage external; sleep 60; lume run vm-homeserver-macos-testing-2 --display none --detach --storage external; lume ls --storage external; lume ls --format json | python3 -m json.tool | head -60"
```

**Resource profile:**

| Phase | vCPU | RAM | Host free (8 GB host) | Purpose |
|-------|------|-----|------------------------|---------|
| First setup | 4 | 4 GB (`4096MB`) | 4 GB | Faster `lume create` + offline unattended (install + SSH health 60×5s) |
| Future runs | 2 | 3.5 GB (`3584MB`) | 4.5 GB | leaves 0.5 GB extra headroom vs 4GB; batch `brew services` + 1 VM steady-state |

Do not run both `local-1/2` twins + `homeserver` twin simultaneously on `homeserver` — host will swap. Batch `vm-local-setup` concurrency `8` is host-side mutex, not per-VM RAM. `lume set` requires `stopped` state.

## Verification (remote)

```bash
# Initial setup — before scale-down:
ssh homeserver-app "lume ls --format json | python3 -m json.tool | head -60"
# expect: vm-homeserver-macos-testing running 4/4GB 50G 192.168.64.5 sshAvailable true, storage external
# Future runs — after lume set:
ssh homeserver-app "lume ls --format json | python3 -m json.tool | head -60"
# expect: vm-homeserver-macos-testing running 2/3.5GB 50G 192.168.64.5 sshAvailable true, storage external

ssh homeserver-app "lume ssh vm-homeserver-macos-testing --storage external 'whoami; id th-allbrew' | head"
ssh homeserver-app "lume ssh vm-homeserver-macos-testing --storage external --user th-allbrew --password th-allbrew 'whoami; echo ok'"
ssh homeserver-app "df -h /Users/Shared/ExternalDrive | head -5; ls -lh /Users/Shared/ExternalDrive/lume-vms/ | head -20"
ssh homeserver-app "lume get vm-homeserver-macos-testing --format json | python3 -m json.tool | grep -E 'cpuCount|memorySize' | head"
# first-setup: cpuCount 4, memorySize 4294967296; future: cpuCount 2, memorySize 3758096384
```

## Troubleshooting (remote deltas)

- **`lume stop` EXIT:130, remains running**: use owner `kill -9 $(pgrep -f 'lume run vm-homeserver-macos-testing')` (not `sudo pkill` — refused). Then `lume ls` shows `stopped` + `Cleaned up stale session file`.
- **`~/.lume` 19Gi Avail error on create**: you omitted `--storage external` — retry with `--storage external` pointing to `/Users/Shared/ExternalDrive/lume-vms`.
- **`/Volumes/EXTBAK2` not found** when using SMB path: `EXTBAK2` not mounted on remote; use rsync dest path `/Users/Shared/ExternalDrive/...` instead.
- **IPSW 18G stuck as dotfile**: rsync still finalizing — poll `ls -lh /Users/Shared/ExternalDrive/.Uni*` vs `*.ipsw`; wait for rename.
- **Version drift 0.3→0.5**: always `lume update --apply` first; `vm-homeserver-macos-testing` created on `0.3.16` may have stale `nvram.bin` — delete/recreate after update.
- **`VZErrorDomain Code=-9` / Failed to get current host key at create 0%**: plain `ssh homeserver-app "lume create ..."` is not enough — Virtualization Secure Enclave host key needs a **logged-in Aqua console**. Follow **[Alternate path — host-key Code=-9](#alternate-path--host-key-code-9--no-aqua-console-verified-2026-08-12)** below. Do not treat guest IPSW mismatch as the first fix (26.6.x guests fail the same way under SSH-only).
- **External volume missing after reboot / loginwindow restart**: `/Users/Shared/ExternalDrive` is a symlink to `/Volumes/External`; USB APFS may not auto-mount. Remount: privileged `diskutil mount disk5s1` (or volume name `External`), then `df -h /Volumes/External` and `lume ls --storage external`.
- **`VM location not found: external` while dir exists**: `lume` config is per-user (`~/.config/lume/config.yaml` under **app-user**). Commands run as another user or without `HOME=/Users/app-user` + `XDG_CONFIG_HOME=/Users/app-user/.config` will miss the location. Always set those env vars (or `sudo -u app-user env HOME=...`) when not already app-user.

## Alternate path — host-key Code=-9 / no Aqua console (verified 2026-08-12)

Use this when **Step D create** (or later `lume run`) fails immediately at install/start with:

```text
VZErrorDomain Code=10007 ... Code=-9 ... Failed to get current host key
```

and logs show `ctkd` / Secure Enclave unable to generate Virtualization host key. Verified recovery path that reached: **running** `vm-homeserver-macos-testing` on **external**, guest **26.6.1**, **SSH yes** for `lume` + `th-allbrew`, then scaled to **2 CPU / 3584MB**.

### When to switch

| Signal | Default path (Steps A–D) | This alternate |
|--------|--------------------------|----------------|
| `lume create` dies at **0%** with host-key Code=-9 | Fails under plain SSH | Required |
| Host auto-upgraded to **27.x beta** (or any host where SEP host key breaks after upgrade) | May fail | Required until host/lume support is clean |
| `stat -f %Su /dev/console` is **root** / no real GUI login | Unreliable | Restore console login first |
| Create progresses past ~10% under `asuser` | N/A | Stay on this path for run/ssh/set |

### Preconditions

- `app-user` has **no sudo** — privileged ops via `su admin-user` then `sudo` (admin has NOPASSWD). Prefer writing remote scripts + `expect`/`su` over interactive prompts.
- Console must be a real logged-in user (e.g. `admin-user`): `stat -f %Su /dev/console` should **not** stay `root` with empty Aqua session.
- **FileVault blocks autologin** — do not rely on `kcpassword` / `sysadminctl -autologin`; use Screen Sharing unlock or physical login if console is lost.
- External storage registered as `external` → `/Users/Shared/ExternalDrive/lume-vms` (same as Step B). IPSW on external (26.6 or **26.6.1** both OK for guest; host-key error is host-side).
- Lume **0.5.3+** with `tahoe` unattended support.

### Helper env (always for app-user lume)

```bash
# Inside remote shell as app-user, or prefix every lume invocation:
export HOME=/Users/app-user
export XDG_CONFIG_HOME=/Users/app-user/.config
export PATH=/Users/app-user/.local/bin:/usr/bin:/bin:$PATH
```

**Aqua domain UID:** console user `admin-user` is typically uid **503** → `launchctl asuser 503`. Confirm: `id -u admin-user`.

### W1 — Restore host usability

```bash
# Probe
ssh homeserver-app 'stat -f %Su /dev/console; who; sw_vers; lume --version; df -h /Volumes/External 2>&1 | head -3; lume config storage list'

# If External unmounted after reboot:
# via su admin-user + sudo:
diskutil mount disk5s1   # or: diskutil mount External
ls -lh /Volumes/External/*.ipsw /Volumes/External/lume-vms 2>&1 | head

# Optional: after major OS upgrade, one-shot FV reboot (reboots host ~2–4m):
# sudo fdesetup authrestart
# (prompts for SecureToken user+password; use admin-user credentials)
```

If console is still not a normal desktop user, unlock via **Screen Sharing** (`vnc://homeserver.local`) so `stat -f %Su /dev/console` shows `admin-user` (or another SecureToken GUI user). Then continue.

### W2 — Create under console Aqua + app-user (not plain SSH)

Keep the parent SSH/`expect` session **alive for the full create** (~5–15 min). Killing the parent mid-create orphans UUID dirs and stalls at partial %.

```bash
# As admin-user (after su), with app-user HOME for lume config:
sudo launchctl asuser $(id -u admin-user) sudo -u app-user env \
  HOME=/Users/app-user \
  XDG_CONFIG_HOME=/Users/app-user/.config \
  PATH=/Users/app-user/.local/bin:/usr/bin:/bin \
  lume create vm-homeserver-macos-testing \
    --ipsw /Volumes/External/UniversalMac_26.6.1_25G76_Restore.ipsw \
    --unattended tahoe --cpu 4 --memory 4GB --disk-size 50GB \
    --storage external
# 26.6 25G72 IPSW also fine if 26.6.1 not present — use whichever is on external.
# MUST: --unattended tahoe (SSH will not work without it)
# MUST: --storage external
# First setup: 4 CPU / 4GB (same resource profile as Step D)
```

Poll: `lume ls --storage external` → `provisioning (ipsw_install)` → eventually `stopped` after **Offline unattended setup completed** and create exit 0. Clean UUID leftovers under `~/.lume/` if create aborts.

### W3 — Run without flaky `--detach`

Under `asuser`, `lume run --detach` often fails with `nohup: can't detach from console` and leaves status `stopped` while claiming success. Prefer **foreground `lume run` backgrounded in a shell** under the same asuser wrapper:

```bash
sudo launchctl asuser $(id -u admin-user) sudo -u app-user env \
  HOME=/Users/app-user XDG_CONFIG_HOME=/Users/app-user/.config \
  PATH=/Users/app-user/.local/bin:/usr/bin:/bin \
  bash -c 'lume run vm-homeserver-macos-testing --display none --storage external >>/tmp/lume-run-live.log 2>&1 &'
# Poll until sshAvailable true / IP assigned:
ssh homeserver-app 'export HOME=/Users/app-user XDG_CONFIG_HOME=/Users/app-user/.config PATH=/Users/app-user/.local/bin:$PATH; lume ls --storage external'
```

If run still returns host-key Code=-9, console Aqua was lost — return to **W1**.

### W4 — SSH verify + th-allbrew (still at 4/4GB)

```bash
ssh homeserver-app 'export HOME=/Users/app-user XDG_CONFIG_HOME=/Users/app-user/.config PATH=/Users/app-user/.local/bin:$PATH
  lume ssh vm-homeserver-macos-testing --storage external --user lume --password lume "whoami; sw_vers; id"
  lume ssh vm-homeserver-macos-testing --storage external --user lume --password lume \
    "echo lume | sudo -S sysadminctl -addUser th-allbrew -fullName th-allbrew -password th-allbrew -admin; id th-allbrew"
  lume ssh vm-homeserver-macos-testing --storage external --user th-allbrew --password th-allbrew "whoami; pwd; id"
'
# sysadminctl may print benign Error:-14120 / AppleM2ScalerParavirtDriver noise; id th-allbrew must succeed.
```

### W5 — Scale down + re-verify (same as Step D post-create)

Also under **asuser + app-user env** so `external` storage resolves and stop/set/run share one identity:

```bash
sudo launchctl asuser $(id -u admin-user) sudo -u app-user env \
  HOME=/Users/app-user XDG_CONFIG_HOME=/Users/app-user/.config \
  PATH=/Users/app-user/.local/bin:/usr/bin:/bin bash -c '
    lume stop vm-homeserver-macos-testing --storage external
    sleep 5
    lume set vm-homeserver-macos-testing --cpu 2 --memory 3584MB --storage external
    lume run vm-homeserver-macos-testing --display none --storage external >>/tmp/lume-run-live.log 2>&1 &
  '
# After boot: lume ls --storage external → 2 / 3.50G / running / ssh yes
# lume ssh ... --user th-allbrew --password th-allbrew "whoami; echo ok"
```

### Ownership after mixed-user ops

If admin-user ever owns the VM dir (e.g. after failed LaunchAgent runs), fix before app-user run:

```bash
# via su admin-user + sudo:
chown -R app-user:staff /Volumes/External/lume-vms/vm-homeserver-macos-testing
```

### Dead ends (skip)

| Approach | Outcome |
|----------|---------|
| Plain `ssh homeserver-app "lume create/run ..."` with no Aqua/`asuser` | Host-key Code=-9 at 0% |
| Hunting for public **27.0** host-matching IPSW | Not required; guest 26.6.x works once host key works |
| `softwareupdate --fetch-full-installer` host downgrade | Often stalls / Code=151; not a reliable remote fix |
| FileVault autologin (`kcpassword` / `sysadminctl -autologin`) | Disabled when FileVault is On |
| `lume run --detach` under `asuser` | Detach/nohup fails; status stays stopped |
| LaunchAgent in wrong `gui/<uid>` or wrong `UserName` | `VM location not found: external` or silent fail |
| Killing `loginwindow` without remount + re-login | External unmounts; host key breaks until console restored |

### Minimal checklist (this path only)

1. Console logged in (`stat -f %Su /dev/console` = real user); External mounted.  
2. Create 4/4 + tahoe + unattended + external via `launchctl asuser <console-uid> sudo -u app-user ...`.  
3. Wait for create exit 0 (do not kill parent).  
4. Run without relying on `--detach` (background shell under same asuser).  
5. SSH as `lume` → `sysadminctl` `th-allbrew` → SSH as `th-allbrew`.  
6. Stop → set 2 / 3584MB → run → re-check SSH.

## Reference

- Base lifecycle, heursitics, and lock model: `../vm-local-setup/SKILL.md` (Architecture, 5-Phase Loop, Local Twin Provisioning).
- Harness single-user mode vs exclusive prefix: `vm-local-setup` § `TH_HOMEBREW_PREFIX_ENABLED`.
- Remote access: `~/.ssh/config` Host `homeserver-app` (`app-user@homeserver.local`, `id_server509`).

## Default test-VM toolchain

After provisioning or recreating `vm-homeserver-macos-testing`, apply the persisted rustup + native clang toolchain so cargo source builds use the lightweight rustup installation instead of Homebrew `rust`/`llvm`.

- **Convenience runner** (runs on all enabled endpoints, including homeserver):
  ```bash path=null start=null
  bun tests/monitored-install-batch/setup-vm-toolchain.mjs
  ```
- **Manual (remote homeserver)**:
  ```bash path=null start=null
  ssh -o User=app-user -i ~/.ssh/id_server509 homeserver.local \
    'lume ssh vm-homeserver-macos-testing --storage external --user th-allbrew --password th-allbrew \
      "curl -fsS http://192.168.64.1:8000/setup-vm-toolchain.sh -o /tmp/setup-vm-toolchain.sh && bash /tmp/setup-vm-toolchain.sh"'
  ```
- **Script**: `tests/monitored-install-batch/lib/setup-vm-toolchain.sh`
- See `vm-local-setup` SKILL for full details.
