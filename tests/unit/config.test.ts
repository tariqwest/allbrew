import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadConfig,
  saveConfig,
  getTapPath,
  setTapPath,
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

// ─── A6: config unit tests ───────────────────────────────────────────────
// Tests file permissions (0o600), tap path validation, and round-trip
// read/write. Uses _setConfigDirForTesting to isolate to a tmpdir.

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "allbrew-config-test-"));
  _setConfigDirForTesting(testDir);
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true }).catch(() => {});
});

describe("loadConfig", () => {
  it("returns empty object when no config file exists", async () => {
    const config = await loadConfig();
    expect(config).toEqual({});
  });

  it("returns parsed config when file exists", async () => {
    const config: AllbrewConfig = { tapPath: "/tmp/tap", tapName: "user/repo" };
    await saveConfig(config);
    const loaded = await loadConfig();
    expect(loaded.tapPath).toBe("/tmp/tap");
    expect(loaded.tapName).toBe("user/repo");
  });
});

describe("saveConfig", () => {
  it("writes config.json with mode 0o600", async () => {
    await saveConfig({ tapPath: "/tmp/tap" });
    const info = await stat(getConfigPath());
    const mode = info.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("creates the config directory with mode 0o700", async () => {
    await saveConfig({ tapPath: "/tmp/tap" });
    const dirInfo = await stat(getConfigDir());
    const mode = dirInfo.mode & 0o777;
    expect(mode).toBe(0o700);
  });

  it("writes valid JSON with a trailing newline", async () => {
    await saveConfig({ tapPath: "/tmp/tap" });
    const raw = await readFile(getConfigPath(), "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(raw);
    expect(parsed.tapPath).toBe("/tmp/tap");
  });
});

describe("getTapPath", () => {
  it("returns null when no tapPath is configured", async () => {
    expect(await getTapPath()).toBeNull();
  });

  it("returns the configured tapPath", async () => {
    await saveConfig({ tapPath: "/tmp/my-tap" });
    expect(await getTapPath()).toBe("/tmp/my-tap");
  });
});

describe("setTapPath", () => {
  it("creates Formula/ and Casks/ dirs when path does not exist", async () => {
    const newTap = join(testDir, "new-tap");
    const result = await setTapPath(newTap);
    expect(result).toBe(newTap);
    const formulaDir = await stat(join(newTap, "Formula"));
    expect(formulaDir.isDirectory()).toBe(true);
    const casksDir = await stat(join(newTap, "Casks"));
    expect(casksDir.isDirectory()).toBe(true);
  });

  it("accepts an existing directory without creating subdirs", async () => {
    const existingTap = join(testDir, "existing-tap");
    await mkdtemp(existingTap + "-", { recursive: true } as any).catch(() => {});
    const { mkdir } = await import("node:fs/promises");
    await mkdir(existingTap, { recursive: true });
    const result = await setTapPath(existingTap);
    expect(result).toBe(existingTap);
  });

  it("rejects a path that is a file, not a directory", async () => {
    const { writeFile } = await import("node:fs/promises");
    const filePath = join(testDir, "not-a-dir");
    await writeFile(filePath, "hello");
    await expect(setTapPath(filePath)).rejects.toThrow(/not a directory/);
  });

  it("saves the resolved path to config", async () => {
    const newTap = join(testDir, "tap");
    await setTapPath(newTap);
    const config = await loadConfig();
    expect(config.tapPath).toBe(newTap);
  });
});

describe("setUpdateAutoPush", () => {
  it("sets update.autoPush in config", async () => {
    await setUpdateAutoPush(true);
    const config = await loadConfig();
    expect(config.update?.autoPush).toBe(true);
  });

  it("preserves existing update.scheduleHours", async () => {
    await saveConfig({ update: { scheduleHours: 12 } });
    await setUpdateAutoPush(true);
    const config = await loadConfig();
    expect(config.update?.autoPush).toBe(true);
    expect(config.update?.scheduleHours).toBe(12);
  });
});

describe("setUpdateScheduleHours", () => {
  it("sets update.scheduleHours in config", async () => {
    await setUpdateScheduleHours(12);
    const config = await loadConfig();
    expect(config.update?.scheduleHours).toBe(12);
  });
});

describe("setGithubToken / getGithubToken", () => {
  it("saves and retrieves a GitHub token", async () => {
    await setGithubToken("ghp_testtoken123");
    expect(await getGithubToken()).toBe("ghp_testtoken123");
  });

  it("falls back to GITHUB_TOKEN env var when not in config", async () => {
    const original = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "ghp_envtoken";
    try {
      expect(await getGithubToken()).toBe("ghp_envtoken");
    } finally {
      if (original === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = original;
    }
  });
});

describe("setGithubUser", () => {
  it("saves the GitHub user to config", async () => {
    await setGithubUser("testuser");
    const config = await loadConfig();
    expect(config.githubUser).toBe("testuser");
  });
});

describe("setRemoteMode", () => {
  it("saves the remote mode to config", async () => {
    await setRemoteMode("github");
    const config = await loadConfig();
    expect(config.remoteMode).toBe("github");
  });
});

describe("getConfigPath / getConfigDir", () => {
  it("returns the test-overridden paths", () => {
    expect(getConfigDir()).toBe(testDir);
    expect(getConfigPath()).toBe(join(testDir, "config.json"));
  });
});

describe("round-trip", () => {
  it("save → load preserves all fields", async () => {
    const original: AllbrewConfig = {
      tapPath: "/tmp/tap",
      tapName: "user/repo",
      githubUser: "testuser",
      githubToken: "ghp_token",
      remoteMode: "github",
      update: { autoPush: true, scheduleHours: 6 },
    };
    await saveConfig(original);
    const loaded = await loadConfig();
    expect(loaded).toEqual(original);
  });
});
