import { describe, it, expect } from "vitest";
import { collectBinaryReleasePayload } from "../../lib/generators/binary-release.ts";
import { renderFormula } from "../../lib/template-renderer.ts";
import { assertValidFormula } from "./helpers/validate-ruby.ts";

/**
 * Tier 2 — Integration: downloads real GitHub release binaries, validates SHA + Ruby output.
 * Run: bun run test:int
 */

const starshipRepoInfo = {
  name: "starship",
  fullName: "starship/starship",
  description: "The minimal, blazing-fast, and infinitely customizable prompt",
  homepage: "https://starship.rs",
  htmlUrl: "https://github.com/starship/starship",
  license: "ISC",
  defaultBranch: "master",
};

const starshipRelease = {
  tagName: "v1.19.0",
  assets: [
    {
      name: "starship-aarch64-apple-darwin.tar.gz",
      url: "https://github.com/starship/starship/releases/download/v1.19.0/starship-aarch64-apple-darwin.tar.gz",
    },
    {
      name: "starship-x86_64-apple-darwin.tar.gz",
      url: "https://github.com/starship/starship/releases/download/v1.19.0/starship-x86_64-apple-darwin.tar.gz",
    },
  ],
};

describe.concurrent("binary-release integration", () => {
  it("starship: payload fields are well-formed", async () => {
    const payload = await collectBinaryReleasePayload(
      starshipRepoInfo,
      starshipRelease,
    );
    expect(payload.template).toBe("binary_release");
    expect(payload.name).toBe("starship");
    expect(payload.className).toBe("Starship");
    expect(payload.version).toBe("1.19.0");
    expect(payload.platformBlocks).toContain("on_macos do");
  });

  it("starship: generates structurally valid Ruby formula", async () => {
    const payload = await collectBinaryReleasePayload(
      starshipRepoInfo,
      starshipRelease,
    );
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Starship < Formula");
    expect(ruby).toContain("on_macos do");
    expect(ruby).toContain("on_arm do");
    expect(ruby).toContain("sha256");
  });

  it("starship: platform blocks reference version interpolation", async () => {
    const payload = await collectBinaryReleasePayload(
      starshipRepoInfo,
      starshipRelease,
    );
    expect(payload.platformBlocks).toContain("#{version}");
  });
});
