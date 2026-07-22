/**
 * allbrew test-suite for the Lume macOS testing harness.
 *
 * This file consumes the harness via its public SDK (`lume-macos-testing-harness`)
 * and defines the test steps, profiles, lifecycle hooks, and readout sections
 * that the harness runs inside the per-project macOS VM user.
 *
 * Usage (from the allbrew repo root):
 *
 *   bun run vm:init           # one-time VM creation per host
 *   bun run vm:setup          # create project user + provision sparsebundle + install bun
 *   bun run vm:test           # default profile (check + unit)
 *   bun run vm:test:int       # integration profile
 *   bun run vm:test:e2e       # E2E profile (acquires exclusive /opt/homebrew)
 *   bun run vm:test:e2e-tap   # E2E-tap profile (acquires exclusive /opt/homebrew)
 *   bun run vm:test:all       # integration + e2e + e2e-tap
 *   bun run vm:reset          # detach /opt/homebrew, delete sparsebundle, delete project user
 *
 * The `e2e` and `e2e-tap` profiles are listed in `homebrewProfiles`, so the
 * harness acquires the project user's APFS sparsebundle at `/opt/homebrew`
 * before running them and detaches it in `finally`. Cask installs target
 * `$HOME/Applications` via `HOMEBREW_CASK_OPTS=--appdir=$HOME/Applications`.
 *
 * The legacy `scripts/e2e-vm-*.sh` orchestration is preserved until parity
 * is verified in a VM acceptance run; do not remove it yet.
 */

import {
  defineTestSuite,
  runAsProjectUser,
  lumeSshExec,
  q,
  type HomebrewSession,
} from "lume-macos-testing-harness";

export const {
  testSteps,
  profiles,
  defaultProfile,
  homebrewProfiles,
  resetSteps,
  readoutSteps,
  hooks,
} = defineTestSuite({
  steps: [
    { id: "check", name: "Type check", command: "bun run check" },
    { id: "unit", name: "Unit tests", command: "bun run test" },
    { id: "templates", name: "Template parity", command: "bun run test:templates" },
    { id: "integration", name: "Integration tests", command: "bun run test:int" },
    { id: "e2e", name: "E2E catalog", command: "E2E=1 bun run test:e2e" },
    { id: "e2e-tap", name: "E2E tap + update cycle", command: "E2E_TAP=1 bun run test:e2e-tap" },
  ],

  profiles: {
    default: ["check", "unit", "templates"],
    integration: ["integration"],
    e2e: ["e2e"],
    "e2e-tap": ["e2e-tap"],
  },

  // These profiles acquire the exclusive /opt/homebrew sparsebundle + mutex.
  // The default and integration profiles do not need Homebrew.
  homebrewProfiles: ["e2e", "e2e-tap"],

  resetSteps: [
    { id: "rm-dist", name: "Remove build artifacts", command: "rm -rf ./dist ./build" },
  ],

  // Additional readout sections run as the project user. The harness already
  // captures system info, project-user home/PATH, host git state, and the
  // exclusive Homebrew prefix state; these sections add allbrew-specific
  // detail ported from the legacy scripts/e2e-vm-readout.sh.
  readoutSteps: [
    { id: "allbrew-version", name: "allbrew Version", command: "bun run bin/allbrew.ts --version 2>/dev/null || echo '(allbrew not runnable)'" },
    { id: "allbrew-config", name: "allbrew Config", command: "cat ~/.config/allbrew/config.json 2>/dev/null || echo '(no config file)'" },
    { id: "allbrew-manifests", name: "allbrew Manifests", command: "ls -la ~/.config/allbrew/packages/ 2>/dev/null && echo '---' && for f in ~/.config/allbrew/packages/*.json; do echo \"=== $(basename \"$f\") ===\"; cat \"$f\"; echo; done 2>/dev/null || echo '(no manifests)'" },
    { id: "brew-version", name: "Homebrew Version", command: "brew --version 2>/dev/null || echo '(Homebrew not installed)'" },
    { id: "brew-taps", name: "Homebrew Taps", command: "brew tap 2>/dev/null || echo '(none)'" },
    { id: "brew-formulae", name: "Installed Formulae", command: "brew list --formula --versions 2>/dev/null || echo '(none)'" },
    { id: "brew-casks", name: "Installed Casks", command: "brew list --cask --versions 2>/dev/null || echo '(none)'" },
    { id: "brew-cellar", name: "Cellar Contents", command: "ls -la \"$(brew --prefix)/Cellar/\" 2>/dev/null || echo '(empty or missing)'" },
    { id: "brew-caskroom", name: "Caskroom Contents", command: "ls -la \"$(brew --prefix)/Caskroom/\" 2>/dev/null || echo '(empty or missing)'" },
    { id: "brew-cache", name: "Homebrew Cache", command: "du -sh \"$(brew --cache)\" 2>/dev/null || echo '(no cache)'" },
    { id: "user-applications", name: "User Applications", command: "ls -la ~/Applications/ 2>/dev/null | head -50 || echo '(empty)'" },
    { id: "tap-git", name: "Tap Repo Git State", command: "TAP_PATH=$(python3 -c \"import json;print(json.load(open(\\\"$HOME/.config/allbrew/config.json\\\")).get(\\\"tapPath\\\",\\\"\\\"))\" 2>/dev/null || echo ''); if [ -n \"$TAP_PATH\" ] && [ -d \"$TAP_PATH/.git\" ]; then echo \"Tap path: $TAP_PATH\"; git -C \"$TAP_PATH\" log --oneline -5 2>/dev/null; git -C \"$TAP_PATH\" status --short 2>/dev/null; else echo '(no tap repo found)'; fi" },
  ],

  hooks: {
    /**
     * Install language runtimes as the VM admin (lume).
     *
     * Homebrew is NOT installed here — the harness provisions a default-prefix
     * Homebrew inside the project user's sparsebundle during acquireHomebrewPrefix
     * (only for Homebrew-requiring profiles). This hook only installs Bun, which
     * allbrew needs for every profile.
     */
    async setupRuntime() {
      // Bun (user-local install under ~/.bun).
      try {
        await runAsProjectUser("[[ -d ~/.bun/bin ]]", "Check bun");
      } catch {
        await runAsProjectUser(
          "curl -fsSL https://bun.sh/install | bash",
          "Install bun"
        );
      }
    },

    /**
     * Install allbrew dependencies in the private workspace as the project user.
     *
     * The lume-macos-testing-harness dependency uses `file:../lume-macos-testing-harness`
     * which doesn't exist inside the VM. Bun install will fail to resolve it and
     * remove the pre-staged directory. So we: (1) run bun install (which installs
     * everything else), (2) re-copy the harness from the shared mount.
     */
    async installProject() {
      await runAsProjectUser(
        [
          "set +e",
          "bun install 2>&1",
          "set -e",
          "mkdir -p node_modules/lume-macos-testing-harness",
          'rsync -a "/Volumes/My Shared Files/node_modules/lume-macos-testing-harness/" node_modules/lume-macos-testing-harness/ 2>&1',
          "test -f node_modules/lume-macos-testing-harness/src/index.ts",
        ].join("\n"),
        "Install dependencies"
      );
    },

    /**
     * Custom readout sections that need direct VM access (not runAsProjectUser).
     * The harness appends $READOUT_FILE for us; we just write to it.
     */
    async readoutSections() {
      // MAS and Setapp are intentionally NOT reported here: they cannot be
      // installed/operated entirely within the project user and would require
      // global state. The harness already captures /Applications separately.
      // This hook is reserved for future allbrew-specific readout that needs
      // admin-level VM access.
      void lumeSshExec;
      void q;
    },

    /**
     * Project-specific cleanup before the project user is deleted.
     * The harness already detaches /opt/homebrew and deletes the sparsebundle
     * during reset; this hook is for allbrew-specific residue (e.g. disposable
     * test taps that escaped the test runner's teardown).
     */
    async resetCleanup() {
      // Best-effort: untap any disposable test/e2e-tap-* taps left behind.
      await lumeSshExec(
        `for t in $(brew tap 2>/dev/null | grep -E '^test/e2e-tap-'); do brew untap "$t" --force 2>/dev/null || true; done`,
        { nothrow: true }
      );
    },

    async nuclearCleanup() {
      // Aggressive cleanup: also wipe the Homebrew cache and any leftover
      // Cellar/Caskroom contents under the (now-detached) prefix.
      await lumeSshExec(
        "rm -rf /opt/homebrew/Library/Caches /opt/homebrew/Cellar /opt/homebrew/Caskroom 2>/dev/null || true",
        { nothrow: true }
      );
    },
  },
});

// Re-export the session type so allbrew's own tooling can reference it.
export type { HomebrewSession };
