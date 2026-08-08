import { describe, expect, test } from "bun:test";
import { resolveGoInstallTarget } from "../../../lib/generators/go-package.ts";

describe("resolveGoInstallTarget", () => {
  test("splits github module subpath @latest (dashbrew)", () => {
    const r = resolveGoInstallTarget(
      "github.com/rasjonell/dashbrew/cmd/dashbrew@latest",
      { fullName: "rasjonell/dashbrew" },
    );
    expect(r.goModule).toBe("github.com/rasjonell/dashbrew");
    expect(r.packagePath).toBe("./cmd/dashbrew");
  });

  test("relative ./cmd path", () => {
    const r = resolveGoInstallTarget("./cmd/damon", {
      fullName: "hashicorp/damon",
    });
    expect(r.goModule).toBe("github.com/hashicorp/damon");
    expect(r.packagePath).toBe("./cmd/damon");
  });

  test("module root only", () => {
    const r = resolveGoInstallTarget("github.com/owner/repo", {
      fullName: "owner/repo",
    });
    expect(r.goModule).toBe("github.com/owner/repo");
    expect(r.packagePath).toBe("");
  });
});
