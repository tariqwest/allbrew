import { describe, it, expect, mock, spyOn, beforeEach } from "bun:test";
import * as sha256 from "../../../lib/sha256.ts";
import { collectSetappCliPayload } from "../../../lib/generators/setapp-cli-formula.ts";
import { renderFormula } from "../../../lib/template-renderer.ts";

const repoInfo = {
  name: "setapp-cli",
  fullName: "maximlevey/setapp-cli",
  description: "Unofficial Setapp CLI",
  homepage: "https://github.com/maximlevey/setapp-cli",
  htmlUrl: "https://github.com/maximlevey/setapp-cli",
  license: "MIT",
};

const release = {
  tagName: "v2.1.0",
  assets: [
    {
      name: "setapp-cli-v2.1.0-macos-universal.tar.gz",
      url: "https://github.com/maximlevey/setapp-cli/releases/download/v2.1.0/setapp-cli-v2.1.0-macos-universal.tar.gz",
    },
  ],
};

describe("collectSetappCliPayload", () => {
  beforeEach(() => {
    mock.restore();
    spyOn(sha256, "downloadAndHash").mockResolvedValue({ sha256: "abc123" });
  });

  it("uses setapp_cli template", async () => {
    const payload = await collectSetappCliPayload(repoInfo, release, {
      name: "setapp-cli",
    });
    expect(payload.template).toBe("setapp_cli");
    expect(payload.name).toBe("setapp-cli");
  });

  it("renders formula with conditional setapp cask install", async () => {
    const payload = await collectSetappCliPayload(repoInfo, release, {
      name: "setapp-cli",
    });
    const ruby = renderFormula(payload);
    expect(ruby).toContain("def ensure_setapp!");
    expect(ruby).toContain("return if setapp_installed?");
    expect(ruby).toContain('Cask::CaskLoader.load("setapp")');
    expect(ruby).toContain("/Applications/Setapp.app");
    expect(ruby).toContain('bin.install "setapp-cli"');
    expect(ruby).not.toContain('depends_on cask: "setapp"');
  });
});
