import { describe, it, expect } from "vitest";
import {
  setappAppPaths,
  setappCliFormulaPath,
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
});
