import { describe, it, expect } from "bun:test";
import {
  detectBrewInstall,
  detectInstallMethod,
  detectServiceConfig,
  detectServiceConfigFromFiles,
  detectBuildSystemFromFiles,
  detectBuildSystemFromArchive,
} from "../../lib/analyzer.ts";

// ─── A5: Analyzer unit suite ─────────────────────────────────────────────
// Covers lib/analyzer.ts paths currently only exercised indirectly via CLI.
// Uses README fixture strings (no I/O, no network, no brew calls).

describe("detectBrewInstall", () => {
  it("detects a plain `brew install foo` command", () => {
    const readme = "## Install\n\n```bash\nbrew install foo\n```";
    const result = detectBrewInstall(readme);
    expect(result).not.toBeNull();
    expect(result!.package).toBe("foo");
    expect(result!.isCask).toBe(false);
    expect(result!.tap).toBeNull();
    expect(result!.installCommand).toBe("brew install foo");
  });

  it("detects `brew install --cask foo` as a cask", () => {
    const readme = "```bash\nbrew install --cask foo\n```";
    const result = detectBrewInstall(readme);
    expect(result).not.toBeNull();
    expect(result!.package).toBe("foo");
    expect(result!.isCask).toBe(true);
  });

  it("detects legacy `brew cask install foo` as a cask", () => {
    const readme = "```bash\nbrew cask install foo\n```";
    const result = detectBrewInstall(readme);
    expect(result).not.toBeNull();
    expect(result!.package).toBe("foo");
    expect(result!.isCask).toBe(true);
  });

  it("includes `brew tap` in the install command when present", () => {
    const readme = "```bash\nbrew tap user/repo\nbrew install foo\n```";
    const result = detectBrewInstall(readme);
    expect(result).not.toBeNull();
    expect(result!.tap).toBe("user/repo");
    expect(result!.installCommand).toBe("brew tap user/repo && brew install foo");
  });

  it("returns null when no brew install command is found", () => {
    expect(detectBrewInstall("just some text")).toBeNull();
    expect(detectBrewInstall("")).toBeNull();
  });

  it("collects allCommands when multiple brew install lines exist", () => {
    const readme = "```bash\nbrew install foo\nbrew install bar\n```";
    const result = detectBrewInstall(readme);
    expect(result!.allCommands).toHaveLength(2);
    expect(result!.allCommands[0].package).toBe("foo");
    expect(result!.allCommands[1].package).toBe("bar");
    // Primary is the first one
    expect(result!.package).toBe("foo");
  });
});

describe("detectInstallMethod", () => {
  it("detects npm install -g", () => {
    const result = detectInstallMethod("```bash\nnpm install -g maildev\n```");
    expect(result).toEqual({ method: "npm", package: "maildev" });
  });

  it("detects pnpm add -g as npm", () => {
    const result = detectInstallMethod("```bash\npnpm add -g toolong\n```");
    expect(result).toEqual({ method: "npm", package: "toolong" });
  });

  it("detects yarn global add as npm", () => {
    const result = detectInstallMethod("```bash\nyarn global add taskbook\n```");
    expect(result).toEqual({ method: "npm", package: "taskbook" });
  });

  it("detects bun add -g as npm", () => {
    const result = detectInstallMethod("```bash\nbun add -g elia-chat\n```");
    expect(result).toEqual({ method: "npm", package: "elia-chat" });
  });

  it("detects npx as npm", () => {
    const result = detectInstallMethod("```bash\nnpx marimo\n```");
    expect(result).toEqual({ method: "npm", package: "marimo" });
  });

  it("detects pip install as pip", () => {
    const result = detectInstallMethod("```bash\npip install s-tui\n```");
    expect(result).toEqual({ method: "pip", package: "s-tui" });
  });

  it("detects pip3 install as pip", () => {
    const result = detectInstallMethod("```bash\npip3 install toolong\n```");
    expect(result).toEqual({ method: "pip", package: "toolong" });
  });

  it("detects pipx install as pip", () => {
    const result = detectInstallMethod("```bash\npipx install toolong\n```");
    expect(result).toEqual({ method: "pip", package: "toolong" });
  });

  it("detects uv tool install as pip", () => {
    const result = detectInstallMethod("```bash\nuv tool install marimo\n```");
    expect(result).toEqual({ method: "pip", package: "marimo" });
  });

  it("detects cargo install", () => {
    const result = detectInstallMethod("```bash\ncargo install ripgrep\n```");
    expect(result).toEqual({ method: "cargo", package: "ripgrep" });
  });

  it("detects go install with version", () => {
    const result = detectInstallMethod("```bash\ngo install github.com/foo/bar@v1.2.3\n```");
    expect(result).toEqual({ method: "go", package: "github.com/foo/bar@v1.2.3" });
  });

  it("detects deno install with --name", () => {
    const result = detectInstallMethod("```bash\ndeno install --name=foo npm:bar\n```");
    expect(result).toEqual({ method: "deno", package: "bar" });
  });

  it("detects swift run", () => {
    const result = detectInstallMethod("```bash\nswift run foo\n```");
    expect(result).toEqual({ method: "swift", package: "foo" });
  });

  it("detects cmake build system", () => {
    const result = detectInstallMethod("```bash\nmkdir build && cd build\ncmake ..\nmake\n```");
    expect(result).toEqual({ method: "build", system: "cmake" });
  });

  it("detects autotools build system", () => {
    const result = detectInstallMethod("```bash\n./configure\nmake\n```");
    expect(result).toEqual({ method: "build", system: "autotools" });
  });

  it("detects make build system", () => {
    const result = detectInstallMethod("```bash\nmake install\n```");
    expect(result).toEqual({ method: "build", system: "make" });
  });

  it("detects meson build system", () => {
    const result = detectInstallMethod("```bash\nmeson setup build\n```");
    expect(result).toEqual({ method: "build", system: "meson" });
  });

  it("detects go build system", () => {
    const result = detectInstallMethod("```bash\ngo build ./...\n```");
    expect(result).toEqual({ method: "build", system: "go" });
  });

  it("returns null when no install method is found", () => {
    expect(detectInstallMethod("just some text")).toBeNull();
    expect(detectInstallMethod("")).toBeNull();
  });
});

describe("detectServiceConfig", () => {
  it("detects `brew services start foo` with high confidence", () => {
    const readme = "## Running\n\n```bash\nbrew services start maildev\n```";
    const result = detectServiceConfig(readme, "maildev");
    expect(result).not.toBeNull();
    expect(result!.command).toBe("maildev");
    expect(result!.keepAlive).toBe(true);
    expect(result!.confidence).toBe("high");
    expect(result!.reason).toContain("brew services");
  });

  it("uses brew services package name when packageName is empty", () => {
    const readme = "```bash\nbrew services start wakapi\n```";
    const result = detectServiceConfig(readme, "");
    expect(result!.command).toBe("wakapi");
  });

  it("detects local web service endpoint with context", () => {
    const readme = [
      "## Usage",
      "",
      "```bash",
      "maildev",
      "```",
      "",
      "The web UI is available at http://localhost:1080",
    ].join("\n");
    const result = detectServiceConfig(readme, "maildev");
    expect(result).not.toBeNull();
    expect(result!.keepAlive).toBe(true);
    // Confidence is high when executable matches packageName
    expect(result!.confidence).toBe("high");
  });

  it("detects launchctl usage with medium confidence", () => {
    const readme = "```bash\nlaunchctl load ~/Library/LaunchAgents/com.foo.plist\n```";
    const result = detectServiceConfig(readme, "foo");
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe("medium");
    expect(result!.reason).toContain("launchctl");
  });

  it("returns null when no service hints are present", () => {
    expect(detectServiceConfig("just a regular CLI tool", "foo")).toBeNull();
    expect(detectServiceConfig("", "foo")).toBeNull();
  });

  it("returns low confidence for generic service wording without a clear command", () => {
    const readme = "This tool runs as a background process.";
    const result = detectServiceConfig(readme, "foo");
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe("low");
  });
});

describe("detectServiceConfigFromFiles", () => {
  it("detects launchd plist files with medium confidence", () => {
    const result = detectServiceConfigFromFiles(
      ["src/main.go", "com.foo.launchagent.plist"],
      "foo",
    );
    expect(result).toEqual({ command: "foo", keepAlive: true, confidence: "medium" });
  });

  it("detects LaunchAgents path plist", () => {
    const result = detectServiceConfigFromFiles(
      ["Library/LaunchAgents/com.foo.plist"],
      "foo",
    );
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe("medium");
  });

  it("returns null when no plist files are present", () => {
    expect(detectServiceConfigFromFiles(["main.go", "README.md"], "foo")).toBeNull();
  });

  it("returns null for plist files without launchd naming", () => {
    expect(detectServiceConfigFromFiles(["Info.plist"], "foo")).toBeNull();
  });

  it("returns null for empty file list", () => {
    expect(detectServiceConfigFromFiles([], "foo")).toBeNull();
    expect(detectServiceConfigFromFiles(null as any, "foo")).toBeNull();
  });
});

describe("detectBuildSystemFromFiles", () => {
  it("detects go.mod", () => {
    expect(detectBuildSystemFromFiles(["go.mod", "main.go"])).toEqual({ method: "go" });
  });

  it("detects Cargo.toml", () => {
    expect(detectBuildSystemFromFiles(["Cargo.toml", "src/main.rs"])).toEqual({ method: "cargo" });
  });

  it("detects package.json", () => {
    expect(detectBuildSystemFromFiles(["package.json", "index.js"])).toEqual({ method: "npm" });
  });

  it("detects setup.py", () => {
    expect(detectBuildSystemFromFiles(["setup.py"])).toEqual({ method: "pip" });
  });

  it("detects pyproject.toml", () => {
    expect(detectBuildSystemFromFiles(["pyproject.toml"])).toEqual({ method: "pip" });
  });

  it("detects CMakeLists.txt", () => {
    expect(detectBuildSystemFromFiles(["CMakeLists.txt"])).toEqual({ method: "build", system: "cmake" });
  });

  it("detects meson.build", () => {
    expect(detectBuildSystemFromFiles(["meson.build"])).toEqual({ method: "build", system: "meson" });
  });

  it("detects configure script", () => {
    expect(detectBuildSystemFromFiles(["configure"])).toEqual({ method: "build", system: "autotools" });
  });

  it("detects Makefile", () => {
    expect(detectBuildSystemFromFiles(["Makefile"])).toEqual({ method: "build", system: "make" });
  });

  it("detects GNUmakefile", () => {
    expect(detectBuildSystemFromFiles(["GNUmakefile"])).toEqual({ method: "build", system: "make" });
  });

  it("returns null when no build files are found", () => {
    expect(detectBuildSystemFromFiles(["README.md", "LICENSE"])).toBeNull();
  });
});

describe("detectBuildSystemFromArchive", () => {
  it("detects install.sh script", () => {
    const result = detectBuildSystemFromArchive(["foo-1.0/install.sh"]);
    expect(result).toEqual({ method: "script", script: "foo-1.0/install.sh" });
  });

  it("detects setup.sh script", () => {
    const result = detectBuildSystemFromArchive(["foo-1.0/setup.sh"]);
    expect(result).toEqual({ method: "script", script: "foo-1.0/setup.sh" });
  });

  it("detects build.sh script", () => {
    const result = detectBuildSystemFromArchive(["foo-1.0/build.sh"]);
    expect(result).toEqual({ method: "script", script: "foo-1.0/build.sh" });
  });

  it("detects go.mod in archive", () => {
    expect(detectBuildSystemFromArchive(["foo-1.0/go.mod"])).toEqual({ method: "go" });
  });

  it("detects CMakeLists.txt in archive", () => {
    expect(detectBuildSystemFromArchive(["foo-1.0/CMakeLists.txt"])).toEqual({ method: "build", system: "cmake" });
  });

  it("detects Cargo.toml in archive", () => {
    expect(detectBuildSystemFromArchive(["foo-1.0/Cargo.toml"])).toEqual({ method: "cargo" });
  });

  it("detects package.json in archive", () => {
    expect(detectBuildSystemFromArchive(["foo-1.0/package.json"])).toEqual({ method: "npm" });
  });

  it("detects setup.py in archive", () => {
    expect(detectBuildSystemFromArchive(["foo-1.0/setup.py"])).toEqual({ method: "pip" });
  });

  it("detects pyproject.toml in archive", () => {
    expect(detectBuildSystemFromArchive(["foo-1.0/pyproject.toml"])).toEqual({ method: "pip" });
  });

  it("detects meson.build in archive", () => {
    expect(detectBuildSystemFromArchive(["foo-1.0/meson.build"])).toEqual({ method: "build", system: "meson" });
  });

  it("detects configure in archive", () => {
    expect(detectBuildSystemFromArchive(["foo-1.0/configure"])).toEqual({ method: "build", system: "autotools" });
  });

  it("detects Makefile in archive", () => {
    expect(detectBuildSystemFromArchive(["foo-1.0/Makefile"])).toEqual({ method: "build", system: "make" });
  });

  it("returns readme-inspect when only a README is present", () => {
    expect(detectBuildSystemFromArchive(["foo-1.0/README.md"])).toEqual({ method: "readme-inspect" });
  });

  it("returns null when no recognizable files are found", () => {
    expect(detectBuildSystemFromArchive(["foo-1.0/LICENSE"])).toBeNull();
  });
});
