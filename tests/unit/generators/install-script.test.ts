import { describe, it, expect, mock, beforeEach } from "bun:test";
import {
  collectInstallScriptPayload,
  detectBinNameFromInstallScript,
} from "../../../lib/generators/install-script.ts";

const qoderScript = `#!/usr/bin/env bash
local bin_name="qodercli"
[[ ! -f "$extract_dir/$bin_name" ]] && fatal_error "Binary $bin_name not found"
`;

mock.module("../../../lib/sha256.ts", () => ({
  hashUrl: mock().mockResolvedValue("mocked_sha256"),
  downloadAndHash: mock().mockImplementation(async (url: string) => {
    const isQoder = String(url).includes("qoder.com");
    return {
      sha256: "script_sha256_mock_value_64chars_pad_abcdef0123456789abcdef",
      buffer: Buffer.from(
        isQoder ? qoderScript : "#!/usr/bin/env bash\necho hi\n",
      ),
      finalUrl: isQoder
        ? "https://download.qoder.com/qodercli/install.sh"
        : url,
    };
  }),
  fetchFollowingRedirects: mock(),
  normalizeFetchUrl: (u: string) => u,
}));

describe("collectInstallScriptPayload", () => {
  beforeEach(() => {
    mock.restore();
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
    // url.split("/").pop() on "https://get.volta.sh" → "get.volta.sh"
    // baseName strips .sh → "get.volta"
    expect(payload.scriptFilename).toBe("get.volta.sh");
    expect(payload.name).toBe("get-volta");
  });

  it("handles bare domain URL", async () => {
    const payload = await collectInstallScriptPayload("https://mise.run");
    // url.split("/").pop() → "mise.run", .run is not .sh/.bash so baseName stays "mise.run"
    // toFormulaName("mise.run") → "mise-run"
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

describe("detectBinNameFromInstallScript", () => {
  it("parses bin_name from qoder-style scripts", () => {
    expect(detectBinNameFromInstallScript(qoderScript)).toBe("qodercli");
  });

  it("parses CLI_NAME from warp-style scripts", () => {
    expect(detectBinNameFromInstallScript('CLI_NAME=warp\n')).toBe("warp");
  });

  it("returns null when no pattern matches", () => {
    expect(detectBinNameFromInstallScript("echo hello")).toBeNull();
  });
});

describe("collectInstallScriptPayload — Qoder", () => {
  beforeEach(() => {
    mock.restore();
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

  it("detects bin_name=qodercli from script body", async () => {
    const payload = await collectInstallScriptPayload(
      "https://qoder.com/install",
      { name: "qoder" },
    );
    expect(payload.name).toBe("qoder");
    expect(payload.testBinName).toBe("qodercli");
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

