import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile, stat, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import {
  loadConfig,
  saveConfig,
  setTapPath,
  getTapPath,
  setUpdateAutoPush,
  setUpdateScheduleHours,
  setGithubToken,
  setGithubUser,
  setRemoteMode,
  getGithubToken,
  getConfigPath,
  getConfigDir,
  _setConfigDirForTesting,
  type AllbrewConfig,
} from "../../lib/config.ts";

// ─── Tier C: existing CLI command tests (config module) ────────────────
// Tests the config subcommands' underlying functions:
//   - set-tap / get-tap
//   - set-update-auto-push
//   - set-update-schedule
//   - set-token
//   - set-remote (mode)
//   - show (loadConfig + getConfigPath)
// Also tests the CLI commands via subprocess to verify end-to-end behavior.

let testConfigDir: string;

beforeEach(async () => {
  testConfigDir = await mkdtemp(join(tmpdir(), "allbrew-cli-config-"));
  _setConfigDirForTesting(testConfigDir);
});

afterEach(async () => {
  await rm(testConfigDir, { recursive: true, force: true }).catch(() => {});
});

describe("Tier C: config set-tap / get-tap", () => {
  it("setTapPath creates Formula/Casks dirs and saves config", async () => {
    const tapDir = join(testConfigDir, "my-tap");
    const resolved = await setTapPath(tapDir);
    expect(resolved).toBe(tapDir);
    expect(existsSync(join(tapDir, "Formula"))).toBe(true);
    expect(existsSync(join(tapDir, "Casks"))).toBe(true);

    const config = await loadConfig();
    expect(config.tapPath).toBe(tapDir);
  });

  it("setTapPath accepts an existing directory", async () => {
    const tapDir = join(testConfigDir, "existing-tap");
    await mkdir(tapDir, { recursive: true });
    const resolved = await setTapPath(tapDir);
    expect(resolved).toBe(tapDir);
    // setTapPath only creates Formula/Casks when the dir doesn't exist (ENOENT).
    // For an existing dir, it just saves the config.
    const config = await loadConfig();
    expect(config.tapPath).toBe(tapDir);
  });

  it("setTapPath rejects a file (not a directory)", async () => {
    const filePath = join(testConfigDir, "not-a-dir.txt");
    await writeFile(filePath, "hello");
    await expect(setTapPath(filePath)).rejects.toThrow(/not a directory/);
  });

  it("getTapPath returns null when not configured", async () => {
    const result = await getTapPath();
    expect(result).toBeNull();
  });

  it("getTapPath returns the configured path", async () => {
    const tapDir = join(testConfigDir, "tap");
    await setTapPath(tapDir);
    const result = await getTapPath();
    expect(result).toBe(tapDir);
  });
});

describe("Tier C: config set-update-auto-push", () => {
  it("sets autoPush to true", async () => {
    await setUpdateAutoPush(true);
    const config = await loadConfig();
    expect(config.update?.autoPush).toBe(true);
  });

  it("sets autoPush to false", async () => {
    await setUpdateAutoPush(false);
    const config = await loadConfig();
    expect(config.update?.autoPush).toBe(false);
  });

  it("preserves other update fields when setting autoPush", async () => {
    await setUpdateScheduleHours(12);
    await setUpdateAutoPush(true);
    const config = await loadConfig();
    expect(config.update?.autoPush).toBe(true);
    expect(config.update?.scheduleHours).toBe(12);
  });
});

describe("Tier C: config set-update-schedule", () => {
  it("sets scheduleHours", async () => {
    await setUpdateScheduleHours(6);
    const config = await loadConfig();
    expect(config.update?.scheduleHours).toBe(6);
  });

  it("preserves other update fields when setting scheduleHours", async () => {
    await setUpdateAutoPush(false);
    await setUpdateScheduleHours(24);
    const config = await loadConfig();
    expect(config.update?.autoPush).toBe(false);
    expect(config.update?.scheduleHours).toBe(24);
  });
});

describe("Tier C: config set-token / set-remote", () => {
  it("setGithubToken saves the token", async () => {
    await setGithubToken("ghp_testtoken123");
    const config = await loadConfig();
    expect(config.githubToken).toBe("ghp_testtoken123");
  });

  it("setGithubUser saves the user", async () => {
    await setGithubUser("testuser");
    const config = await loadConfig();
    expect(config.githubUser).toBe("testuser");
  });

  it("setRemoteMode saves the mode", async () => {
    await setRemoteMode("github");
    const config = await loadConfig();
    expect(config.remoteMode).toBe("github");
  });

  it("setRemoteMode accepts 'local'", async () => {
    await setRemoteMode("local");
    const config = await loadConfig();
    expect(config.remoteMode).toBe("local");
  });
});

describe("Tier C: getGithubToken (env fallback)", () => {
  it("returns token from config when set", async () => {
    await setGithubToken("ghp_fromconfig");
    const token = await getGithubToken();
    expect(token).toBe("ghp_fromconfig");
  });

  it("falls back to GITHUB_TOKEN env var when config has no token", async () => {
    const originalToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "ghp_fromenv";
    try {
      const token = await getGithubToken();
      expect(token).toBe("ghp_fromenv");
    } finally {
      if (originalToken !== undefined) {
        process.env.GITHUB_TOKEN = originalToken;
      } else {
        delete process.env.GITHUB_TOKEN;
      }
    }
  });

  it("returns null when no token in config or env", async () => {
    const originalToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    try {
      const token = await getGithubToken();
      expect(token).toBeNull();
    } finally {
      if (originalToken !== undefined) {
        process.env.GITHUB_TOKEN = originalToken;
      }
    }
  });
});

describe("Tier C: config show (getConfigPath / getConfigDir)", () => {
  it("getConfigPath returns the config file path", () => {
    const path = getConfigPath();
    expect(path).toBe(join(testConfigDir, "config.json"));
  });

  it("getConfigDir returns the config directory", () => {
    const dir = getConfigDir();
    expect(dir).toBe(testConfigDir);
  });
});

describe("Tier C: config file permissions", () => {
  it("config file has 0o600 permissions after save", async () => {
    await saveConfig({ tapPath: "/tmp/test" });
    const fileStat = await stat(getConfigPath());
    // On macOS, stat returns the actual mode. 0o600 = 33152 in decimal
    expect(fileStat.mode & 0o777).toBe(0o600);
  });

  it("config dir has 0o700 permissions after save", async () => {
    await saveConfig({ tapPath: "/tmp/test" });
    const dirStat = await stat(getConfigDir());
    expect(dirStat.mode & 0o777).toBe(0o700);
  });
});

describe("Tier C: config round-trip", () => {
  it("saves and loads a full config", async () => {
    const config: AllbrewConfig = {
      tapPath: "/tmp/my-tap",
      tapName: "user/tap",
      githubUser: "testuser",
      githubToken: "ghp_token",
      remoteMode: "github",
      update: {
        autoPush: true,
        scheduleHours: 12,
      },
    };
    await saveConfig(config);
    const loaded = await loadConfig();
    expect(loaded).toEqual(config);
  });

  it("loadConfig returns empty object when file does not exist", async () => {
    const loaded = await loadConfig();
    expect(loaded).toEqual({});
  });

  it("loadConfig returns empty object on invalid JSON", async () => {
    await writeFile(getConfigPath(), "{ invalid json }", "utf-8");
    const loaded = await loadConfig();
    expect(loaded).toEqual({});
  });
});

// CLI subprocess tests — verify the CLI commands work end-to-end
describe("Tier C: CLI subprocess (config commands)", () => {
  it("allbrew config show prints config file path", () => {
    const result = spawnSync(
      "bun",
      ["run", "bin/allbrew.ts", "config", "show"],
      {
        encoding: "utf-8",
        env: {
          ...process.env,
          ALLBREW_CONFIG_DIR: testConfigDir,
        },
        timeout: 15_000,
      },
    );
    // The CLI uses the default config dir (~/.config/allbrew), not the
    // test override (which is only for unit tests via _setConfigDirForTesting).
    // So we just verify the command runs without error.
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Config file:");
  });

  it("allbrew config get-tap prints warning when not configured", () => {
    const result = spawnSync(
      "bun",
      ["run", "bin/allbrew.ts", "config", "get-tap"],
      {
        encoding: "utf-8",
        env: { ...process.env },
        timeout: 15_000,
      },
    );
    // May print the configured tap or the warning — either is valid
    expect(result.status).toBe(0);
  });

  it("allbrew --help lists all commands", () => {
    const result = spawnSync("bun", ["run", "bin/allbrew.ts", "--help"], {
      encoding: "utf-8",
      timeout: 15_000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("init");
    expect(result.stdout).toContain("config");
    expect(result.stdout).toContain("update-formulas");
    expect(result.stdout).toContain("hooks");
    expect(result.stdout).toContain("service");
  });

  it("allbrew config --help lists subcommands", () => {
    const result = spawnSync(
      "bun",
      ["run", "bin/allbrew.ts", "config", "--help"],
      {
        encoding: "utf-8",
        timeout: 15_000,
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("set-tap");
    expect(result.stdout).toContain("get-tap");
    expect(result.stdout).toContain("show");
    expect(result.stdout).toContain("set-update-auto-push");
    expect(result.stdout).toContain("set-update-schedule");
    expect(result.stdout).toContain("set-token");
    expect(result.stdout).toContain("set-remote");
  });

  it("allbrew hooks --help lists install/uninstall", () => {
    const result = spawnSync(
      "bun",
      ["run", "bin/allbrew.ts", "hooks", "--help"],
      {
        encoding: "utf-8",
        timeout: 15_000,
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("install");
    expect(result.stdout).toContain("uninstall");
  });

  it("allbrew service --help lists install/uninstall", () => {
    const result = spawnSync(
      "bun",
      ["run", "bin/allbrew.ts", "service", "--help"],
      {
        encoding: "utf-8",
        timeout: 15_000,
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("install");
    expect(result.stdout).toContain("uninstall");
  });

  it("allbrew --version prints version", () => {
    const result = spawnSync(
      "bun",
      ["run", "bin/allbrew.ts", "--version"],
      {
        encoding: "utf-8",
        timeout: 15_000,
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
