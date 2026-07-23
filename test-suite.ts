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
 *   bun run vm:test --profile user-journeys  # Tier A nightly journeys (A1/A3/A4)
 *   bun run vm:reset          # detach /opt/homebrew, delete sparsebundle, delete project user
 *
 * The `e2e` and `e2e-tap` profiles are listed in `homebrewProfiles`, so the
 * harness acquires the project user's APFS sparsebundle at `/opt/homebrew`
 * before running them and detaches it in `finally`. Cask installs target
 * `$HOME/Applications` via `HOMEBREW_CASK_OPTS=--appdir=$HOME/Applications`.
 *
 * The legacy `scripts/e2e-vm-*.sh` orchestration was removed after the
 * `acceptance` profile passed a VM run (T0.5 verified). Use `bun run vm:*`
 * for VM execution and `scripts/test-e2e*.sh` for local filesystem runs.
 */

import {
  defineTestSuite,
  runAsProjectUser,
  lumeSshExec,
  q,
  runFile,
  appendReadout,
  type HomebrewSession,
  type Journey,
} from "lume-macos-testing-harness";
import { readFileSync, existsSync } from "node:fs";

const BASE_TIMEOUT = 600_000; // 10 min per journey step

function testCommand(file: string, pattern: string, timeout = BASE_TIMEOUT): string {
  return `bun test ${file} --test-name-pattern '${pattern}' --timeout ${timeout}`;
}

function brewCleanup(formulaName: string): string {
  return `brew services stop ${formulaName} 2>/dev/null || true; brew uninstall --force ${formulaName} 2>/dev/null || true; rm -f ~/Library/LaunchAgents/homebrew.mxcl.${formulaName}.plist`;
}

export const {
  testSteps,
  profiles,
  defaultProfile,
  homebrewProfiles,
  resetSteps,
  readoutSteps,
  hooks,
  journeys,
  journeyProfiles,
  journeyDefaultProfile,
} = defineTestSuite({
  steps: [
    { id: "check", name: "Type check", command: "bun run check" },
    { id: "unit", name: "Unit tests", command: "bun run test" },
    { id: "templates", name: "Template parity", command: "bun run test:templates" },
    { id: "integration", name: "Integration tests", command: "bun run test:int" },
    { id: "e2e", name: "E2E catalog", command: "E2E=1 bun run test:e2e" },
    { id: "e2e-tap", name: "E2E tap + update cycle", command: "E2E_TAP=1 bun run test:e2e-tap" },
    {
      id: "e2e-acceptance",
      name: "E2E T0.5 acceptance",
      command: "E2E=1 bun test tests/e2e/catalog.e2e.test.ts --test-name-pattern 'npkill' --timeout 300000",
    },
  ],

  profiles: {
    default: ["check", "unit", "templates"],
    integration: ["integration"],
    e2e: ["e2e"],
    "e2e-tap": ["e2e-tap"],
    // T0.5 acceptance: one fast E2E entry to validate exclusive /opt/homebrew.
    acceptance: ["e2e-acceptance"],
  },

  // These profiles acquire the exclusive /opt/homebrew sparsebundle + mutex.
  // The default and integration profiles do not need Homebrew.
  homebrewProfiles: ["e2e", "e2e-tap", "acceptance", "user-journeys"],

  // Tier A lifecycle journeys (A1, A3, A4). Each journey runs as its own
  // per-journey timeout + cleanup block and writes a machine-readable
  // journeys.json under tests/e2e-runs/<ts>/.
  journeys: [
    {
      id: "a1a-npm-service",
      name: "A1a npm service lifecycle",
      tier: "A1",
      timeoutMs: 600_000,
      steps: [
        {
          name: "npm-maildev persona",
          command: testCommand(
            "tests/e2e-lume/service-personas-lume.test.ts",
            "npm-maildev",
            600_000
          ),
        },
      ],
      cleanup: [{ name: "maildev cleanup", command: brewCleanup("maildev") }],
    },
    {
      id: "a1b-pip-service",
      name: "A1b pip service lifecycle",
      tier: "A1",
      timeoutMs: 600_000,
      steps: [
        {
          name: "pip-pypiserver persona",
          command: testCommand(
            "tests/e2e-lume/service-personas-lume.test.ts",
            "pip-pypiserver",
            600_000
          ),
        },
      ],
      cleanup: [{ name: "pypiserver cleanup", command: brewCleanup("pypiserver") }],
    },
    {
      id: "a1c-go-service",
      name: "A1c go service lifecycle",
      tier: "A1",
      timeoutMs: 600_000,
      steps: [
        {
          name: "go-gotty persona",
          command: testCommand(
            "tests/e2e-lume/service-personas-lume.test.ts",
            "go-gotty",
            600_000
          ),
        },
      ],
      cleanup: [{ name: "gotty cleanup", command: brewCleanup("gotty") }],
    },
    {
      id: "a3-hooks-smoke",
      name: "A3 hooks smoke",
      tier: "A3",
      timeoutMs: 180_000,
      steps: [
        {
          name: "hooks smoke",
          command: testCommand(
            "tests/e2e-lume/hooks-smoke-lume.test.ts",
            "A3 hooks smoke",
            180_000
          ),
        },
      ],
      cleanup: [
        {
          name: "hooks uninstall",
          command: "allbrew hooks uninstall 2>/dev/null || true",
        },
      ],
    },
    {
      id: "a4-zap-persona",
      name: "A4 zap persona",
      tier: "A4",
      timeoutMs: 600_000,
      steps: [
        {
          name: "zap persona",
          command: testCommand(
            "tests/e2e-lume/zap-persona-lume.test.ts",
            "A4 zap persona",
            600_000
          ),
        },
      ],
      cleanup: [
        {
          name: "seaquel cleanup",
          command: "brew uninstall --zap --force seaquel 2>/dev/null || true; rm -rf ~/Applications/Seaquel.app",
        },
      ],
    },
  ] as Journey[],

  journeyProfiles: {
    // Nightly user-journey suite. Runs the Tier A lifecycle journeys
    // sequentially under an exclusive /opt/homebrew session.
    "user-journeys": [
      "a1a-npm-service",
      "a1b-pip-service",
      "a1c-go-service",
      "a3-hooks-smoke",
      "a4-zap-persona",
    ],
  },

  journeyDefaultProfile: "user-journeys",

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
    { id: "brew-services", name: "Homebrew Services", command: "brew services list 2>/dev/null || echo '(none)'" },
    { id: "launch-agents", name: "Launch Agents", command: "ls -la ~/Library/LaunchAgents/ 2>/dev/null | grep -E 'allbrew|managed' || echo '(no allbrew/managed agents)'" },
    { id: "user-applications", name: "User Applications", command: "ls -la ~/Applications/ 2>/dev/null | head -50 || echo '(empty)'" },
    { id: "system-applications", name: "System Applications (cask leakage check)", command: "ls -la /Applications/ 2>/dev/null | grep -E 'allbrew|managed|test' || echo '(no suspicious system apps)'" },
    { id: "residual-audit", name: "Residual Audit", command: "echo '--- brew list ---'; brew list --full-name -1 2>/dev/null || echo '(none)'; echo '--- residual processes ---'; pgrep -fl 'fake-service|maildev|wakapi|godns' 2>/dev/null || echo '(none)'; echo '--- manifests ---'; ls -la ~/.config/allbrew/packages/ 2>/dev/null || echo '(none)'" },
    { id: "tap-git", name: "Tap Repo Git State", command: "TAP_PATH=$(python3 -c \"import json;print(json.load(open(\\\"$HOME/.config/allbrew/config.json\\\")).get(\\\"tapPath\\\",\\\"\\\"))\" 2>/dev/null || echo ''); if [ -n \"$TAP_PATH\" ] && [ -d \"$TAP_PATH/.git\" ]; then echo \"Tap path: $TAP_PATH\"; git -C \"$TAP_PATH\" log --oneline -5 2>/dev/null; git -C \"$TAP_PATH\" status --short 2>/dev/null; else echo '(no tap repo found)'; fi" },
    { id: "homebrew-prefix-state", name: "Homebrew Prefix State", command: "echo 'brew --prefix: '$(brew --prefix 2>/dev/null || echo '(none)'); echo '--- mount ---'; mount | grep /opt/homebrew || echo '(not mounted)'; echo '--- lock ---'; ls -ld /var/run/lume-homebrew.lock 2>/dev/null || echo '(no lock)'" },
    { id: "disk-usage", name: "Disk Usage", command: "df -h /opt/homebrew $HOME 2>/dev/null || df -h /" },
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
     * The `lume-macos-testing-harness` devDependency now points to a vendored copy
     * (`file:./vendor/lume-macos-testing-harness`) that is staged into the workspace,
     * so we install it alongside the other devDependencies. `test-suite.ts` needs it
     * for type-checking inside the VM.
     */
    async installProject() {
      await runAsProjectUser(
        [
          "set +e",
          "bun install 2>&1",
          "set -e",
          "test -d node_modules/@types/bun",
          "test -d node_modules/typescript",
          "test -d node_modules/lume-macos-testing-harness",
        ].join("\n"),
        "Install dependencies"
      );
    },

    /**
     * Custom readout sections that need direct VM access (not runAsProjectUser).
     * Append the machine-readable journey summary to the human readout file
     * so nightly run records contain a per-journey pass/fail/timeout overview.
     */
    async readoutSections() {
      const readoutFile = runFile("readout.txt");
      const journeysFile = runFile("journeys.json");

      if (existsSync(journeysFile)) {
        try {
          const raw = readFileSync(journeysFile, "utf-8");
          const parsed = JSON.parse(raw) as {
            results?: { id: string; name: string; tier?: string; status: string; durationMs: number; error?: string }[];
            summary?: { total: number; pass: number; fail: number; timeout: number };
          };
          const results = parsed.results ?? [];
          const summary = parsed.summary ?? { total: results.length, pass: 0, fail: 0, timeout: 0 };
          const lines = [
            `  Total: ${summary.total}  Pass: ${summary.pass}  Fail: ${summary.fail}  Timeout: ${summary.timeout}`,
            ...results.map(
              (r) =>
                `  ${r.id} (${r.tier ?? "-"}): ${r.status} (${r.durationMs}ms)${
                  r.error ? ` — ${r.error.split("\n")[0]}` : ""
                }`
            ),
          ].join("\n");
          appendReadout(readoutFile, "Journey Results", lines);
        } catch (err) {
          appendReadout(
            readoutFile,
            "Journey Results",
            `  (could not parse journeys.json: ${
              err instanceof Error ? err.message : String(err)
            })`
          );
        }
      } else {
        appendReadout(readoutFile, "Journey Results", "  (no journeys.json produced)");
      }

      // Keep these helpers available for future admin-level readout.
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
