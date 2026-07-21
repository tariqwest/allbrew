import { describe, it, expect, mock, beforeEach } from "bun:test";
import { collectInstallScriptPayload } from "../../../lib/generators/install-script.ts";

mock.module("../../../lib/sha256.ts", () => ({
  hashUrl: mock().mockResolvedValue("mocked_sha256"),
  downloadAndHash: mock()
    .mockResolvedValue({ sha256: "script_sha256_mock_value_64chars_pad_abcdef0123456789abcdef" }),
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
