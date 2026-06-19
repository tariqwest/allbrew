import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectScriptInstallPayload } from "../../../lib/generators/script-install.ts";

vi.mock("../../../lib/sha256.ts", () => ({
  hashUrl: vi.fn().mockResolvedValue("mocked_sha256"),
  downloadAndHash: vi
    .fn()
    .mockResolvedValue({ sha256: "script_sha256_mock_value_64chars_pad_abcdef0123456789abcdef" }),
}));

describe("collectScriptInstallPayload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns payload with correct template identifier", async () => {
    const payload = await collectScriptInstallPayload(
      "https://starship.rs/install.sh",
    );
    expect(payload.template).toBe("script_install");
  });

  it("extracts filename from URL", async () => {
    const payload = await collectScriptInstallPayload(
      "https://starship.rs/install.sh",
    );
    expect(payload.scriptFilename).toBe("install.sh");
  });

  it("derives name from filename (strips .sh)", async () => {
    const payload = await collectScriptInstallPayload(
      "https://starship.rs/install.sh",
    );
    expect(payload.name).toBe("install");
  });

  it("handles URL without .sh extension", async () => {
    const payload = await collectScriptInstallPayload(
      "https://get.volta.sh",
    );
    // url.split("/").pop() on "https://get.volta.sh" → "get.volta.sh"
    // baseName strips .sh → "get.volta"
    expect(payload.scriptFilename).toBe("get.volta.sh");
    expect(payload.name).toBe("get-volta");
  });

  it("handles bare domain URL", async () => {
    const payload = await collectScriptInstallPayload("https://mise.run");
    // url.split("/").pop() → "mise.run", .run is not .sh/.bash so baseName stays "mise.run"
    // toFormulaName("mise.run") → "mise-run"
    expect(payload.scriptFilename).toBe("mise.run");
    expect(payload.name).toBe("mise-run");
  });

  it("includes SHA256 from download", async () => {
    const payload = await collectScriptInstallPayload(
      "https://starship.rs/install.sh",
    );
    expect(payload.sha256).toBeTruthy();
    expect(payload.sha256.length).toBeGreaterThan(0);
  });

  it("uses URL as homepage", async () => {
    const payload = await collectScriptInstallPayload(
      "https://starship.rs/install.sh",
    );
    expect(payload.homepage).toBe("https://starship.rs/install.sh");
  });

  it("generates default description", async () => {
    const payload = await collectScriptInstallPayload(
      "https://starship.rs/install.sh",
    );
    expect(payload.desc).toContain("Install");
    expect(payload.desc).toContain("install");
  });

  it("respects name override", async () => {
    const payload = await collectScriptInstallPayload(
      "https://starship.rs/install.sh",
      { name: "starship" },
    );
    expect(payload.name).toBe("starship");
    expect(payload.className).toBe("Starship");
  });

  it("respects desc override", async () => {
    const payload = await collectScriptInstallPayload(
      "https://starship.rs/install.sh",
      { desc: "Cross-shell prompt" },
    );
    expect(payload.desc).toBe("Cross-shell prompt");
  });

  it("generates livecheck block with URL", async () => {
    const payload = await collectScriptInstallPayload(
      "https://starship.rs/install.sh",
    );
    expect(payload.livecheckBlock).toContain("livecheck do");
    expect(payload.livecheckBlock).toContain("starship.rs/install.sh");
  });

  it("includes allbrew dependency", async () => {
    const payload = await collectScriptInstallPayload(
      "https://starship.rs/install.sh",
    );
    expect(payload.allbrewDependency).toContain("allbrew");
  });

  it("strips query params from filename", async () => {
    const payload = await collectScriptInstallPayload(
      "https://example.com/install.sh?version=latest",
    );
    expect(payload.scriptFilename).toBe("install.sh");
  });
});
