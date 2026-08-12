import { describe, it, expect } from "bun:test";
import {
  setappAppPaths,
  setappCliFormulaPath,
  deriveTapSlug,
} from "../../lib/setapp-bootstrap.ts";

describe("setapp-bootstrap helpers", () => {
  it("setappAppPaths returns standard locations", () => {
    const paths = setappAppPaths();
    expect(paths).toContain("/Applications/Setapp.app");
    expect(paths.some((p) => p.endsWith("Applications/Setapp.app"))).toBe(true);
  });

  it("setappCliFormulaPath points to tap Formula dir", () => {
    expect(setappCliFormulaPath("/tmp/tap")).toBe(
      "/tmp/tap/Formula/setapp-cli.rb",
    );
  });

  it("deriveTapSlug uses config githubUser + tapName", () => {
    expect(
      deriveTapSlug("/Users/x/homebrew-allbrew", {
        githubUser: "tariqwest",
        tapName: "homebrew-allbrew",
      }),
    ).toBe("tariqwest/allbrew");
  });

  it("deriveTapSlug strips homebrew- prefix from path basename", () => {
    expect(
      deriveTapSlug("/Users/th-allbrew/homebrew-allbrew", {
        githubUser: "th-allbrew",
      }),
    ).toBe("th-allbrew/allbrew");
  });

  it("deriveTapSlug falls back when config empty", () => {
    const slug = deriveTapSlug("/tmp/homebrew-mytapp", {});
    expect(slug).toMatch(/\/mytapp$/);
  });
});
