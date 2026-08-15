import { describe, it, expect, mock, beforeEach } from "bun:test";
import {
  collectInstallScriptPayload,
  detectInstallScriptFlags,
} from "../../../lib/generators/install-script.ts";
import { downloadAndHash } from "../../../lib/sha256.ts";

const MOCK_SCRIPT = '#!/bin/bash\n# FORCE=1 skips prompts\nif [ "$FORCE" = "1" ]; then true; fi\n';

function makeDownloadAndHashMock(buffer: string | Buffer = MOCK_SCRIPT) {
  return { sha256: "script_sha256_mock_value_64chars_pad_abcdef0123456789abcdef", buffer: typeof buffer === "string" ? Buffer.from(buffer) : buffer };
}

mock.module("../../../lib/sha256.ts", () => ({
  hashUrl: mock().mockResolvedValue("mocked_sha256"),
  downloadAndHash: mock().mockResolvedValue(makeDownloadAndHashMock()),
}));

function mockDownloadText(script: string) {
  (downloadAndHash as any).mockResolvedValue(makeDownloadAndHashMock(script));
}

describe("detectInstallScriptFlags", () => {
  it("detects FORCE and ensures BIN_DIR", () => {
    const flags = detectInstallScriptFlags(
      'if [ -n "${FORCE}" ]; then echo force; fi\nBIN_DIR=${BIN_DIR:-$HOME/.local/bin}\n',
    );
    expect(flags.env.FORCE).toBe("1");
    expect(flags.ensureBinDir).toBe(true);
  });

  it("detects --yes and --non-interactive", () => {
    const flags = detectInstallScriptFlags(
      "Usage: install.sh [--yes] [--non-interactive]\n",
    );
    expect(flags.args).toContain("--yes");
    expect(flags.args).toContain("--non-interactive");
  });

  it("prefers --yes over -y when both are documented CLI options", () => {
    const flags = detectInstallScriptFlags(
      "Usage: install.sh [--yes|-y]\n  -y, --yes\n",
    );
    expect(flags.args).toContain("--yes");
    expect(flags.args).not.toContain("-y");
  });

  it("does not treat apt-get install -y as a CLI -y flag", () => {
    const flags = detectInstallScriptFlags(
      "apt-get install -y curl\ndnf install -y git\n",
    );
    expect(flags.args).not.toContain("-y");
  });

  it("detects --no-modify-path and --quiet", () => {
    const flags = detectInstallScriptFlags(
      `Usage: install.sh [options]
        -y, --yes
        --no-modify-path
        -q, --quiet
      `,
    );
    expect(flags.args).toContain("--no-modify-path");
    expect(flags.args).toContain("--quiet");
    expect(flags.env.NO_MODIFY_PATH).toBe("1");
    expect(flags.env.QUIET).toBe("1");
  });

  it("detects -f/--force and sets FORCE", () => {
    const flags = detectInstallScriptFlags(
      'Usage: install.sh [-f|--force]\nwhile [ $# -gt 0 ]; do\n  case "$1" in\n    -f | --force)\n      FORCE=1\n      shift\n      ;;\n  esac\ndone\n',
    );
    expect(flags.args).toContain("--force");
    expect(flags.args).not.toContain("-f");
    expect(flags.env.FORCE).toBe("1");
  });

  it("passes --version value when the script documents it", () => {
    const flags = detectInstallScriptFlags(
      `Usage: install.sh [options]
        --version <version>  Install a specific version
      `,
      "myapp",
    );
    expect(flags.valueArgs).toEqual([
      { arg: "--version", value: "version.to_s" },
    ]);
  });

  it("passes --to / --prefix / --bin-dir when documented as install paths", () => {
    const flags = detectInstallScriptFlags(
      `Usage: install.sh [options]
        --to <dir>         Install to directory
        --bin-dir <dir>    Bin directory
      `,
      "myapp",
    );
    expect(flags.valueArgs).toContainEqual({
      arg: "--to",
      value: '(buildpath/"bin").to_s',
    });
    expect(flags.valueArgs).toContainEqual({
      arg: "--bin-dir",
      value: '(buildpath/"bin").to_s',
    });
  });

  it("detects rustup-style --default-toolchain and --profile literals", () => {
    const flags = detectInstallScriptFlags(
      `Options:
        --default-toolchain <DEFAULT_TOOLCHAIN>
        --profile <PROFILE>
      `,
      "rustup",
    );
    expect(flags.valueArgs).toContainEqual({
      arg: "--default-toolchain",
      value: '"none"',
    });
    expect(flags.valueArgs).toContainEqual({ arg: "--profile", value: '"minimal"' });
  });

  it("does not treat rustup --version as a value flag", () => {
    const flags = detectInstallScriptFlags(
      `Options:
        -V, --version
                Print version
      `,
    );
    expect(flags.valueArgs).not.toContainEqual(
      expect.objectContaining({ arg: "--version" }),
    );
  });

  it("sets app-specific NO_MODIFY_PATH env variables", () => {
    const flags = detectInstallScriptFlags(
      'UV_NO_MODIFY_PATH="${UV_NO_MODIFY_PATH:-0}"\n',
      "uv",
    );
    expect(flags.env.UV_NO_MODIFY_PATH).toBe("1");
  });

  it("sets VOLTA_HOME to a buildpath app home", () => {
    const flags = detectInstallScriptFlags(
      'VOLTA_HOME="${VOLTA_HOME:-$HOME/.volta}"\n',
      "volta",
    );
    expect(flags.env.VOLTA_HOME).toBe('(buildpath/".volta").to_s');
  });
});

describe("detectInstallScriptShell", () => {
  it("prefers sh for env sh shebang and POSIXLY_CORRECT guards", async () => {
    const { detectInstallScriptShell } = await import(
      "../../../lib/generators/install-script.ts"
    );
    expect(
      detectInstallScriptShell("#!/usr/bin/env sh\necho hi\n"),
    ).toBe("sh");
    expect(
      detectInstallScriptShell(
        "if [ -n \"$BASH_VERSION\" ] && [ -z \"$POSIXLY_CORRECT\" ]; then\n  echo 'Please use `sh` instead'\n  exit 1\nfi\n",
      ),
    ).toBe("sh");
    expect(detectInstallScriptShell("#!/usr/bin/env bash\n")).toBe("bash");
  });
});

describe("collectInstallScriptPayload", () => {
  beforeEach(() => {
    mock.restore();
    (downloadAndHash as any).mockResolvedValue(makeDownloadAndHashMock());
  });

  it("returns payload with correct template identifier", async () => {
    const payload = await collectInstallScriptPayload(
      "https://starship.rs/install.sh",
    );
    expect(payload.template).toBe("install_script");
  });

  it("extracts filename from URL", async () => {
    const payload = await collectInstallScriptPayload(
      "https://starship.rs/install.sh",
    );
    expect(payload.scriptFilename).toBe("install.sh");
  });

  it("derives name from filename (strips .sh)", async () => {
    const payload = await collectInstallScriptPayload(
      "https://starship.rs/install.sh",
    );
    expect(payload.name).toBe("install");
  });

  it("handles URL without .sh extension", async () => {
    const payload = await collectInstallScriptPayload(
      "https://get.volta.sh",
    );
    expect(payload.scriptFilename).toBe("get.volta.sh");
    expect(payload.name).toBe("get-volta");
  });

  it("handles bare domain URL", async () => {
    const payload = await collectInstallScriptPayload("https://mise.run");
    expect(payload.scriptFilename).toBe("mise.run");
    expect(payload.name).toBe("mise-run");
  });

  it("includes SHA256 from download", async () => {
    const payload = await collectInstallScriptPayload(
      "https://starship.rs/install.sh",
    );
    expect(payload.sha256).toBeTruthy();
    expect(payload.sha256.length).toBeGreaterThan(0);
  });

  it("uses URL as homepage", async () => {
    const payload = await collectInstallScriptPayload(
      "https://starship.rs/install.sh",
    );
    expect(payload.homepage).toBe("https://starship.rs/install.sh");
  });

  it("generates default description", async () => {
    const payload = await collectInstallScriptPayload(
      "https://starship.rs/install.sh",
    );
    expect(payload.desc).toContain("Install");
    expect(payload.desc).toContain("install");
  });

  it("respects name override", async () => {
    const payload = await collectInstallScriptPayload(
      "https://starship.rs/install.sh",
      { name: "starship" },
    );
    expect(payload.name).toBe("starship");
    expect(payload.className).toBe("Starship");
  });

  it("respects desc override", async () => {
    const payload = await collectInstallScriptPayload(
      "https://starship.rs/install.sh",
      { desc: "Cross-shell prompt" },
    );
    expect(payload.desc).toBe("Cross-shell prompt");
  });

  it("emits FORCE env and ensureBinDir from script text", async () => {
    const payload = await collectInstallScriptPayload(
      "https://starship.rs/install.sh",
      { name: "starship" },
    );
    expect(payload.installEnvLines).toContain('ENV["FORCE"]');
    expect(payload.ensureBinDir).toBe(true);
  });

  it("honors explicit scriptArgs and force options", async () => {
    const payload = await collectInstallScriptPayload(
      "https://example.com/install.sh",
      {
        name: "agent-deck",
        force: true,
        scriptArgs: ["--non-interactive"],
        installFlags: {
          args: [],
          env: {},
          ensureBinDir: true,
          valueArgs: [],
        },
      },
    );
    expect(payload.installEnvLines).toContain("FORCE");
    expect(payload.installArgsRuby).toContain("--non-interactive");
  });

  it("extracts binary name from install script body", async () => {
    mockDownloadText(
      '#!/bin/bash\nBINARY_NAME="${BINARY_NAME:-ante}"\necho "$BINARY_NAME"\n',
    );
    const payload = await collectInstallScriptPayload(
      "https://ante.run/install.sh",
      { name: "ante-install-sh" },
    );
    expect(payload.testBinName).toBe("ante");
  });

  it("generates livecheck block with URL", async () => {
    const payload = await collectInstallScriptPayload(
      "https://starship.rs/install.sh",
    );
    expect(payload.livecheckBlock).toContain("livecheck do");
    expect(payload.livecheckBlock).toContain("starship.rs/install.sh");
  });

  it("omits allbrew dependency", async () => {
    const payload = await collectInstallScriptPayload(
      "https://starship.rs/install.sh",
    );
    expect(payload.allbrewDependency).toBe("");
  });

  it("strips query params from filename", async () => {
    const payload = await collectInstallScriptPayload(
      "https://example.com/install.sh?version=latest",
    );
    expect(payload.scriptFilename).toBe("install.sh");
  });
});

describe("collectInstallScriptPayload — Qoder", () => {
  beforeEach(() => {
    mock.restore();
    (downloadAndHash as any).mockResolvedValue(makeDownloadAndHashMock());
  });

  it("returns correct template identifier", async () => {
    const payload = await collectInstallScriptPayload(
      "https://qoder.com/install",
    );
    expect(payload.template).toBe("install_script");
  });

  it("extracts filename from URL without .sh extension", async () => {
    const payload = await collectInstallScriptPayload(
      "https://qoder.com/install",
    );
    expect(payload.scriptFilename).toBe("install");
    expect(payload.name).toBe("install");
    expect(payload.className).toBe("Install");
  });

  it("includes SHA256 from download", async () => {
    const payload = await collectInstallScriptPayload(
      "https://qoder.com/install",
    );
    expect(payload.sha256).toBeTruthy();
  });

  it("uses URL as homepage", async () => {
    const payload = await collectInstallScriptPayload(
      "https://qoder.com/install",
    );
    expect(payload.homepage).toBe("https://qoder.com/install");
  });

  it("respects name override", async () => {
    const payload = await collectInstallScriptPayload(
      "https://qoder.com/install",
      { name: "qoder-cli" },
    );
    expect(payload.name).toBe("qoder-cli");
    expect(payload.className).toBe("QoderCli");
  });

  it("generates livecheck block with install URL", async () => {
    const payload = await collectInstallScriptPayload(
      "https://qoder.com/install",
    );
    expect(payload.livecheckBlock).toContain("livecheck do");
    expect(payload.livecheckBlock).toContain("qoder.com/install");
  });
});

describe("collectInstallScriptPayload — Cua Driver", () => {
  beforeEach(() => {
    mock.restore();
    (downloadAndHash as any).mockResolvedValue(makeDownloadAndHashMock());
  });

  it("returns correct template identifier", async () => {
    const payload = await collectInstallScriptPayload(
      "https://cua.ai/driver/install.sh",
    );
    expect(payload.template).toBe("install_script");
  });

  it("extracts install.sh filename and default name", async () => {
    const payload = await collectInstallScriptPayload(
      "https://cua.ai/driver/install.sh",
    );
    expect(payload.scriptFilename).toBe("install.sh");
    expect(payload.name).toBe("install");
  });

  it("respects cua-driver name override", async () => {
    const payload = await collectInstallScriptPayload(
      "https://cua.ai/driver/install.sh",
      { name: "cua-driver" },
    );
    expect(payload.name).toBe("cua-driver");
    expect(payload.className).toBe("CuaDriver");
    expect(payload.testBinName).toBe("cua-driver");
  });

  it("uses install script URL as homepage", async () => {
    const payload = await collectInstallScriptPayload(
      "https://cua.ai/driver/install.sh",
      { name: "cua-driver" },
    );
    expect(payload.homepage).toBe("https://cua.ai/driver/install.sh");
    expect(payload.url).toBe("https://cua.ai/driver/install.sh");
  });

  it("includes SHA256 from download", async () => {
    const payload = await collectInstallScriptPayload(
      "https://cua.ai/driver/install.sh",
      { name: "cua-driver" },
    );
    expect(payload.sha256).toBeTruthy();
    expect(payload.sha256.length).toBeGreaterThan(0);
  });

  it("generates livecheck block with install script URL", async () => {
    const payload = await collectInstallScriptPayload(
      "https://cua.ai/driver/install.sh",
      { name: "cua-driver" },
    );
    expect(payload.livecheckBlock).toContain("livecheck do");
    expect(payload.livecheckBlock).toContain("cua.ai/driver/install.sh");
  });
});

describe("collectInstallScriptPayload — version attribute", () => {
  beforeEach(() => {
    mock.restore();
    (downloadAndHash as any).mockResolvedValue(makeDownloadAndHashMock());
  });

  it("includes a non-empty version for static install URLs", async () => {
    const payload = await collectInstallScriptPayload(
      "https://starship.rs/install.sh",
    );
    expect(payload.version).toBeTruthy();
    expect(String(payload.version).length).toBeGreaterThan(0);
  });

  it("respects version override", async () => {
    const payload = await collectInstallScriptPayload(
      "https://starship.rs/install.sh",
      { version: "v9.8.7" },
    );
    expect(payload.version).toBe("9.8.7");
  });

  it("extracts version from URL path when present", async () => {
    const payload = await collectInstallScriptPayload(
      "https://example.com/releases/v1.2.3/install.sh",
    );
    expect(payload.version).toBe("1.2.3");
  });
});
