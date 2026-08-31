import { describe, it, expect } from "bun:test";
import { parseJudgment } from "../../lib/dogfood.ts";
import { formatDiagnosticReport } from "../../lib/diagnose.ts";

// These tests are pure and offline: they exercise the fm-output parser and
// the diagnostic report formatting without touching the filesystem or fm.

describe("parseJudgment", () => {
  it("parses a clean JSON object", () => {
    const raw = JSON.stringify({
      generator: "binary-release",
      packageName: "hister",
      binName: "hister",
      isService: true,
      serviceCommand: "hister listen",
      rationale: "daemon",
    });
    const result = parseJudgment(raw);
    expect(result).not.toBeNull();
    expect(result!.generator).toBe("binary-release");
    expect(result!.isService).toBe(true);
    expect(result!.serviceCommand).toBe("hister listen");
  });

  it("parses JSON after prose and ANSI color codes", () => {
    const raw =
      "\x1b[32mHere is my analysis\x1b[0m\n\n" +
      '{"generator":"npm-package","packageName":"foo","binName":"foo","isService":false,"serviceCommand":"","rationale":"cli"}';
    const result = parseJudgment(raw);
    expect(result).not.toBeNull();
    expect(result!.generator).toBe("npm-package");
    expect(result!.isService).toBe(false);
  });

  it("returns a fallback object with rationale when no JSON is present", () => {
    const result = parseJudgment("Just some prose with no JSON.");
    expect(result).not.toBeNull();
    expect(result!.generator).toBeNull();
    expect(result!.rationale).toContain("Just some prose");
  });

  it("returns a fallback object on malformed JSON", () => {
    const result = parseJudgment('{"generator": "unclosed');
    expect(result).not.toBeNull();
    expect(result!.generator).toBeNull();
  });
});

describe("formatDiagnosticReport", () => {
  it("redacts tokens and secrets", () => {
    const report = {
      capturedAt: "2026-08-31T00:00:00.000Z",
      os: { name: "macOS", version: "27.0", build: "26A1", kernel: "", arch: "arm64" },
      brew: {
        version: "Homebrew 6.0",
        prefix: "/opt/homebrew",
        config: { HOMEBREW_GITHUB_API_TOKEN: "secret123", someKey: "ok" },
        formulae: [],
        casks: [],
      },
      allbrew: {
        version: "0.0.38",
        binary: "/opt/homebrew/bin/allbrew",
        configPath: "/Users/tariqwest/.config/allbrew/config.json",
        config: { githubToken: "ghp_abc", tapPath: "/Users/tariqwest/homebrew-mytapp" },
        manifests: [],
      },
      runtime: { node: "v26.8.1", bun: "1.4.0" },
    };
    const text = formatDiagnosticReport(report as any);
    expect(text).not.toContain("secret123");
    expect(text).not.toContain("ghp_abc");
    expect(text).toContain("[REDACTED]");
  });

  it("includes managed packages and homebrew state", () => {
    const report = {
      capturedAt: "2026-08-31T00:00:00.000Z",
      os: { name: "macOS", version: "27.0", build: "26A1", kernel: "", arch: "arm64" },
      brew: {
        version: "Homebrew 6.0",
        prefix: "/opt/homebrew",
        config: null,
        formulae: ["hister"],
        casks: [],
      },
      allbrew: {
        version: "0.0.38-dogfood.1",
        binary: "/opt/homebrew/bin/allbrew",
        configPath: "/Users/x/.config/allbrew/config.json",
        config: {},
        manifests: ["hister"],
      },
      runtime: { node: "v26.8.1", bun: "1.4.0" },
    };
    const text = formatDiagnosticReport(report as any);
    expect(text).toContain("hister");
    expect(text).toContain("Homebrew 6.0");
    expect(text).toContain("0.0.38-dogfood.1");
  });
});
