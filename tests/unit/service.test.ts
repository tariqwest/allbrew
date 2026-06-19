import { describe, it, expect } from "vitest";
import {
  serviceFromOptions,
  normalizeServiceConfig,
  buildServiceBlock,
} from "../../lib/generators/service.ts";

describe("serviceFromOptions", () => {
  it("returns null when service is explicitly false", () => {
    expect(serviceFromOptions({ service: false })).toBeNull();
  });

  it("returns null when no service options provided", () => {
    expect(serviceFromOptions({})).toBeNull();
    expect(serviceFromOptions()).toBeNull();
  });

  it("uses serviceCommand when service flag is set", () => {
    const result = serviceFromOptions({
      service: true,
      serviceCommand: "foo serve",
    });
    expect(result).toEqual({
      command: "foo serve",
      keepAlive: true,
      workingDir: null,
      logPath: null,
      errorLogPath: null,
    });
  });

  it("uses serviceCommand alone", () => {
    const result = serviceFromOptions({ serviceCommand: "bar --port 8080" });
    expect(result?.command).toBe("bar --port 8080");
  });

  it("uses serviceConfig object", () => {
    const result = serviceFromOptions({
      serviceConfig: {
        command: "wakapi",
        keepAlive: true,
        logPath: "/tmp/wakapi.log",
      },
    });
    expect(result?.command).toBe("wakapi");
    expect(result?.logPath).toBe("/tmp/wakapi.log");
  });

  it("falls back to fallbackName when command is empty", () => {
    const result = serviceFromOptions(
      { service: true, serviceCommand: "" },
      "myapp",
    );
    expect(result?.command).toBe("myapp");
  });
});

describe("normalizeServiceConfig", () => {
  it("returns null for null/undefined config", () => {
    expect(normalizeServiceConfig(null)).toBeNull();
    expect(normalizeServiceConfig(undefined)).toBeNull();
  });

  it("returns null when no command can be derived", () => {
    expect(normalizeServiceConfig({ command: "" })).toBeNull();
    expect(normalizeServiceConfig({}, "")).toBeNull();
  });

  it("defaults keepAlive to true", () => {
    const result = normalizeServiceConfig({ command: "foo" });
    expect(result?.keepAlive).toBe(true);
  });

  it("respects keepAlive: false", () => {
    const result = normalizeServiceConfig({
      command: "foo",
      keepAlive: false,
    });
    expect(result?.keepAlive).toBe(false);
  });
});

describe("buildServiceBlock", () => {
  it("returns empty string for null config", () => {
    expect(buildServiceBlock(null)).toBe("");
    expect(buildServiceBlock(undefined)).toBe("");
  });

  it("builds service block with formula executable", () => {
    const result = buildServiceBlock({ command: "foo serve" }, "foo");
    expect(result).toContain("service do");
    expect(result).toContain('opt_bin/"foo"');
    expect(result).toContain('"serve"');
    expect(result).toContain("keep_alive true");
    expect(result).toContain("end\n\n");
  });

  it("builds service block with plain executable", () => {
    const result = buildServiceBlock({ command: "/usr/bin/myapp" }, "foo");
    expect(result).toContain('"/usr/bin/myapp"');
  });

  it("builds service block without keepAlive when false", () => {
    const result = buildServiceBlock(
      { command: "foo", keepAlive: false },
      "foo",
    );
    expect(result).not.toContain("keep_alive");
  });

  it("includes log paths when provided", () => {
    const result = buildServiceBlock(
      {
        command: "foo",
        logPath: "var/log/foo.log",
        errorLogPath: "var/log/foo-err.log",
      },
      "foo",
    );
    expect(result).toContain("log_path");
    expect(result).toContain("error_log_path");
  });

  it("includes working_dir when provided", () => {
    const result = buildServiceBlock(
      { command: "foo", workingDir: "/opt/homebrew/var" },
      "foo",
    );
    expect(result).toContain("working_dir");
  });
});
