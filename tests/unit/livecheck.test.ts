import { describe, it, expect } from "vitest";
import {
  npmLivecheckBlock,
  pypiLivecheckBlock,
  cratesLivecheckBlock,
  goModuleLivecheckBlock,
  githubLatestLivecheckBlock,
  urlVersionLivecheckBlock,
  masAppLivecheckBlock,
} from "../../lib/generators/livecheck.ts";

describe("npmLivecheckBlock", () => {
  it("returns registry URL with version regex", () => {
    const result = npmLivecheckBlock("maildev");
    expect(result).toContain("livecheck do");
    expect(result).toContain("https://registry.npmjs.org/maildev/latest");
    expect(result).toContain("regex(");
    expect(result).toContain("end\n\n");
  });

  it("encodes package name", () => {
    const result = npmLivecheckBlock("@hehehai/buke");
    expect(result).toContain("%40hehehai%2Fbuke");
  });

  it("returns empty string for falsy input", () => {
    expect(npmLivecheckBlock("")).toBe("");
    expect(npmLivecheckBlock(null)).toBe("");
  });
});

describe("pypiLivecheckBlock", () => {
  it("returns PyPI JSON URL with version regex", () => {
    const result = pypiLivecheckBlock("marimo");
    expect(result).toContain("https://pypi.org/pypi/marimo/json");
    expect(result).toContain("livecheck do");
  });

  it("returns empty string for falsy input", () => {
    expect(pypiLivecheckBlock("")).toBe("");
  });
});

describe("cratesLivecheckBlock", () => {
  it("returns crates.io API URL", () => {
    const result = cratesLivecheckBlock("managarr");
    expect(result).toContain("https://crates.io/api/v1/crates/managarr");
    expect(result).toContain("max_stable_version");
  });

  it("returns empty string for falsy input", () => {
    expect(cratesLivecheckBlock("")).toBe("");
  });
});

describe("goModuleLivecheckBlock", () => {
  it("returns Go module proxy URL", () => {
    const result = goModuleLivecheckBlock("github.com/muety/wakapi");
    expect(result).toContain(
      "https://proxy.golang.org/github.com/muety/wakapi/@latest",
    );
    expect(result).toContain("Version");
  });

  it("returns empty string for falsy input", () => {
    expect(goModuleLivecheckBlock("")).toBe("");
  });
});

describe("githubLatestLivecheckBlock", () => {
  it("returns github_latest strategy block", () => {
    const result = githubLatestLivecheckBlock();
    expect(result).toContain("url :head");
    expect(result).toContain("strategy :github_latest");
  });
});

describe("urlVersionLivecheckBlock", () => {
  it("returns livecheck block with URL and version regex", () => {
    const result = urlVersionLivecheckBlock("https://example.com/install.sh");
    expect(result).toContain("livecheck do");
    expect(result).toContain("https://example.com/install.sh");
  });

  it("returns empty string for falsy input", () => {
    expect(urlVersionLivecheckBlock("")).toBe("");
  });
});

describe("masAppLivecheckBlock", () => {
  it("returns iTunes lookup URL", () => {
    const result = masAppLivecheckBlock("12345");
    expect(result).toContain("https://itunes.apple.com/lookup?id=12345");
    expect(result).toContain("version");
  });

  it("returns empty string for falsy input", () => {
    expect(masAppLivecheckBlock("")).toBe("");
  });
});
