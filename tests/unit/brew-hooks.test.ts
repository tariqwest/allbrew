import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  BREW_WRAP_CONTENT,
  brewWrapPath,
  installBrewHooks,
  uninstallBrewHooks,
  shellSnippet,
  zshrcMarkerPath,
} from "../../lib/brew-hooks.ts";

// ─── A6: brew-hooks unit tests ───────────────────────────────────────────
// Pure wrapper content + path construction + install/uninstall with a tmpdir
// prefix (no real brew call).

describe("BREW_WRAP_CONTENT", () => {
  it("defines the allbrew_brew wrapper function", () => {
    expect(BREW_WRAP_CONTENT).toContain("allbrew_brew()");
  });

  it("passes through to command brew with args", () => {
    expect(BREW_WRAP_CONTENT).toContain('command brew "$@"');
  });

  it("runs livecheck + update-formulas after a successful brew update", () => {
    expect(BREW_WRAP_CONTENT).toContain('"$1" = "update"');
    expect(BREW_WRAP_CONTENT).toContain("brew livecheck --installed --newer-only --json --quiet");
    expect(BREW_WRAP_CONTENT).toContain("allbrew update-formulas");
  });

  it("does NOT run a redundant second `command brew update`", () => {
    // The bug fix (T0.4/A3 prereq): the wrapper previously ran
    // `command brew update` again after the livecheck branch, causing a
    // double update. The first `command brew "$@"` already ran `brew update`.
    const matches = BREW_WRAP_CONTENT.match(/command brew update/g);
    expect(matches).toBeNull();
  });

  it("returns the exit code of the original brew command", () => {
    expect(BREW_WRAP_CONTENT).toContain("local ret=$?");
    expect(BREW_WRAP_CONTENT).toContain("return $ret");
  });

  it("documents the opt-in alias mechanism", () => {
    expect(BREW_WRAP_CONTENT).toContain("alias brew=allbrew_brew");
  });
});

describe("brewWrapPath", () => {
  it("constructs the wrap path under <prefix>/etc/allbrew-brew-wrap", () => {
    expect(brewWrapPath("/opt/homebrew")).toBe(
      "/opt/homebrew/etc/allbrew-brew-wrap",
    );
  });

  it("works with a tmpdir prefix", () => {
    const tmp = "/tmp/test-prefix";
    expect(brewWrapPath(tmp)).toBe(join(tmp, "etc", "allbrew-brew-wrap"));
  });
});

describe("shellSnippet", () => {
  it("returns a source command and alias comment", () => {
    const snippet = shellSnippet("/opt/homebrew/etc/allbrew-brew-wrap");
    expect(snippet).toContain('source "/opt/homebrew/etc/allbrew-brew-wrap"');
    expect(snippet).toContain("alias brew=allbrew_brew");
  });
});

describe("zshrcMarkerPath", () => {
  it("returns the .zshrc path in the home directory", () => {
    const path = zshrcMarkerPath();
    expect(path.endsWith(".zshrc")).toBe(true);
  });
});

describe("installBrewHooks / uninstallBrewHooks", () => {
  let prefix: string;

  beforeEach(async () => {
    prefix = await mkdtemp(join(tmpdir(), "allbrew-hooks-test-"));
  });

  afterEach(async () => {
    await rm(prefix, { recursive: true, force: true }).catch(() => {});
  });

  it("installBrewHooks writes the wrapper to <prefix>/etc/allbrew-brew-wrap", async () => {
    const wrapPath = await installBrewHooks(prefix);
    expect(wrapPath).toBe(brewWrapPath(prefix));

    const content = await readFile(wrapPath, "utf-8");
    expect(content).toBe(BREW_WRAP_CONTENT);
  });

  it("installBrewHooks creates the etc/ directory if it does not exist", async () => {
    await installBrewHooks(prefix);
    const info = await stat(join(prefix, "etc"));
    expect(info.isDirectory()).toBe(true);
  });

  it("uninstallBrewHooks removes the wrapper file", async () => {
    await installBrewHooks(prefix);
    const wrapPath = brewWrapPath(prefix);
    await uninstallBrewHooks(prefix);
    await expect(stat(wrapPath)).rejects.toThrow();
  });

  it("uninstallBrewHooks does not throw when the wrapper file does not exist", async () => {
    await expect(uninstallBrewHooks(prefix)).resolves.toBe(brewWrapPath(prefix));
  });

  it("install + uninstall round-trip leaves no wrapper behind", async () => {
    const wrapPath = await installBrewHooks(prefix);
    await uninstallBrewHooks(prefix);
    await expect(stat(wrapPath)).rejects.toThrow();
  });
});
