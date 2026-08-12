import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import {
  writeUpdateScript,
  plistContent,
  launchAgentPath,
  logPath,
} from "../../lib/launchd-service.ts";

// ─── A6: launchd-service unit tests ──────────────────────────────────────
// Split: update script (writeUpdateScript) and plist (plistContent) tested
// separately. No real brew/launchctl calls — writeUpdateScript accepts
// optional allbrewBin/brewPrefix for testability.

describe("plistContent", () => {
  it("produces valid XML with plist header", () => {
    const plist = plistContent("/tmp/update-managed.sh", 21600);
    expect(plist).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(plist).toContain("<plist version=\"1.0\">");
    expect(plist).toContain("</plist>");
  });

  it("includes the com.allbrew.update Label", () => {
    const plist = plistContent("/tmp/update-managed.sh", 21600);
    expect(plist).toContain("<key>Label</key>");
    expect(plist).toContain("<string>com.allbrew.update</string>");
  });

  it("includes the script path in ProgramArguments", () => {
    const scriptPath = "/opt/homebrew/libexec/allbrew/update-managed.sh";
    const plist = plistContent(scriptPath, 21600);
    expect(plist).toContain("<key>ProgramArguments</key>");
    expect(plist).toContain(`<string>${scriptPath}</string>`);
  });

  it("includes StartInterval with the given seconds", () => {
    const plist = plistContent("/tmp/script.sh", 21600);
    expect(plist).toContain("<key>StartInterval</key>");
    expect(plist).toContain("<integer>21600</integer>");
  });

  it("includes RunAtLoad true", () => {
    const plist = plistContent("/tmp/script.sh", 21600);
    expect(plist).toContain("<key>RunAtLoad</key>");
    expect(plist).toContain("<true/>");
  });

  it("does NOT include log rotation logic (rotation lives in the update script)", () => {
    const plist = plistContent("/tmp/script.sh", 21600);
    expect(plist).not.toContain("stat -f%z");
    expect(plist).not.toContain("10485760");
  });
});

describe("writeUpdateScript", () => {
  let scriptDir: string;
  let scriptPath: string;

  beforeEach(async () => {
    scriptDir = await mkdtemp(join(tmpdir(), "allbrew-launchd-test-"));
    scriptPath = join(scriptDir, "update-managed.sh");
  });

  afterEach(async () => {
    await rm(scriptDir, { recursive: true, force: true }).catch(() => {});
  });

  it("writes a script with set -euo pipefail", async () => {
    await writeUpdateScript(scriptPath, {
      allbrewBin: "/tmp/fake-allbrew",
      brewPrefix: "/tmp/fake-prefix",
    });
    const content = await readFile(scriptPath, "utf-8");
    expect(content).toContain("set -euo pipefail");
  });

  it("resolves PATH from allbrewBin dirname + brewPrefix/bin", async () => {
    await writeUpdateScript(scriptPath, {
      allbrewBin: "/opt/homebrew/bin/allbrew",
      brewPrefix: "/opt/homebrew",
    });
    const content = await readFile(scriptPath, "utf-8");
    expect(content).toContain("/opt/homebrew/bin");
    expect(content).toContain("export PATH=");
  });

  it("includes log rotation at 10MB (10485760 bytes)", async () => {
    await writeUpdateScript(scriptPath, {
      allbrewBin: "/tmp/fake-allbrew",
      brewPrefix: "/tmp/fake-prefix",
    });
    const content = await readFile(scriptPath, "utf-8");
    expect(content).toContain("stat -f%z");
    expect(content).toContain("10485760");
    expect(content).toContain('mv "$LOG"');
  });

  it("uses the log path from logPath()", async () => {
    await writeUpdateScript(scriptPath, {
      allbrewBin: "/tmp/fake-allbrew",
      brewPrefix: "/tmp/fake-prefix",
    });
    const content = await readFile(scriptPath, "utf-8");
    expect(content).toContain(logPath());
  });

  it("includes brew update and livecheck + update-formulas", async () => {
    await writeUpdateScript(scriptPath, {
      allbrewBin: "/tmp/fake-allbrew",
      brewPrefix: "/tmp/fake-prefix",
    });
    const content = await readFile(scriptPath, "utf-8");
    expect(content).toContain("brew update");
    expect(content).toContain("brew livecheck --installed --newer-only --json --quiet");
    expect(content).toContain("/tmp/fake-allbrew update-formulas");
  });

  it("writes the script with executable mode 0o755", async () => {
    await writeUpdateScript(scriptPath, {
      allbrewBin: "/tmp/fake-allbrew",
      brewPrefix: "/tmp/fake-prefix",
    });
    const info = await stat(scriptPath);
    const mode = info.mode & 0o777;
    expect(mode).toBe(0o755);
  });

  it("creates parent directories if they do not exist", async () => {
    const nestedPath = join(scriptDir, "nested", "dir", "update-managed.sh");
    await writeUpdateScript(nestedPath, {
      allbrewBin: "/tmp/fake-allbrew",
      brewPrefix: "/tmp/fake-prefix",
    });
    const content = await readFile(nestedPath, "utf-8");
    expect(content).toContain("set -euo pipefail");
  });
});

describe("launchAgentPath", () => {
  it("returns the com.allbrew.update.plist path under ~/Library/LaunchAgents", () => {
    const path = launchAgentPath();
    expect(path).toContain("Library");
    expect(path).toContain("LaunchAgents");
    expect(path).toContain("com.allbrew.update.plist");
  });
});

describe("logPath", () => {
  it("returns the allbrew-update.log path under ~/Library/Logs", () => {
    const path = logPath();
    expect(path).toContain("Library");
    expect(path).toContain("Logs");
    expect(path).toContain("allbrew-update.log");
  });
});
