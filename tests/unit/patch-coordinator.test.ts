import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

import {
  isSafeRelPath,
  isAllowedTarget,
  validateFixPackage,
  enqueueLinkedRetry,
  reconcileOne,
} from "../monitored-install-batch/lib/patch-coordinator.mjs";
import { writeFixPackage, sha256Hex } from "../monitored-install-batch/lib/batch-helpers.mjs";

function sha(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

describe("isSafeRelPath / isAllowedTarget", () => {
  it("rejects absolute, parent, and null-byte paths", () => {
    expect(isSafeRelPath("/etc/passwd")).toBe(false);
    expect(isSafeRelPath("../secret")).toBe(false);
    expect(isSafeRelPath("lib/../../etc/passwd")).toBe(false);
    expect(isSafeRelPath("a\0b")).toBe(false);
    expect(isSafeRelPath("")).toBe(false);
    expect(isSafeRelPath(null)).toBe(false);
  });

  it("accepts normal relative paths", () => {
    expect(isSafeRelPath("lib/foo.ts")).toBe(true);
    expect(isSafeRelPath("tests/unit/x.test.ts")).toBe(true);
  });

  it("allows only product prefixes", () => {
    expect(isAllowedTarget("lib/analyzer.ts")).toBe(true);
    expect(isAllowedTarget("bin/allbrew.ts")).toBe(true);
    expect(isAllowedTarget("tests/unit/x.ts")).toBe(true);
    expect(isAllowedTarget("scripts/release.ts")).toBe(true);
    expect(isAllowedTarget(".agents/skills/x.md")).toBe(true);
    expect(isAllowedTarget("package.json")).toBe(false);
    expect(isAllowedTarget("node_modules/x")).toBe(false);
    expect(isAllowedTarget("../lib/x")).toBe(false);
  });
});

describe("writeFixPackage", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "fixpkg-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("defaults to docs mode without patches/files", () => {
    const fixDir = writeFixPackage(root, {
      url: "https://example.com/a",
      slug: "pkg-a",
      failureClass: "install_failed",
      sourceRunId: "run-a",
    });
    const manifest = JSON.parse(readFileSync(join(fixDir, "manifest.json"), "utf8"));
    expect(manifest.mode).toBe("docs");
    expect(manifest.patches).toEqual([]);
    expect(manifest.files).toEqual([]);
    expect(existsSync(join(fixDir, "FIX.md"))).toBe(true);
  });

  it("writes patch mode with checksummed files", () => {
    const content = "export const x = 1;\n";
    const fixDir = writeFixPackage(root, {
      url: "https://example.com/b",
      slug: "pkg-b",
      failureClass: "verify_failed",
      sourceRunId: "run-b",
      files: [{ target: "lib/example.ts", content }],
      patches: [{ name: "0001-fix.patch", content: "diff --git a/lib/example.ts b/lib/example.ts\n" }],
    });
    const manifest = JSON.parse(readFileSync(join(fixDir, "manifest.json"), "utf8"));
    expect(manifest.mode).toBe("patch");
    expect(manifest.files).toHaveLength(1);
    expect(manifest.files[0].target).toBe("lib/example.ts");
    expect(manifest.files[0].sha256).toBe(sha256Hex(content));
    expect(manifest.patches).toHaveLength(1);
    expect(manifest.patches[0].sha256).toBe(
      sha256Hex("diff --git a/lib/example.ts b/lib/example.ts\n"),
    );
  });
});

describe("validateFixPackage", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "valfix-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects unsafe file targets", () => {
    const fixDir = join(root, "fix-package");
    mkdirSync(join(fixDir, "files"), { recursive: true });
    mkdirSync(join(fixDir, "patches"), { recursive: true });
    const body = "bad\n";
    writeFileSync(join(fixDir, "files/evil"), body);
    writeFileSync(
      join(fixDir, "manifest.json"),
      JSON.stringify({
        schemaVersion: 1,
        mode: "patch",
        sourceRunId: "r1",
        patches: [],
        files: [{ path: "files/evil", target: "../secret", sha256: sha(body) }],
      }) + "\n",
    );
    writeFileSync(join(fixDir, "FIX.md"), "# fix\n");
    const v = validateFixPackage(fixDir);
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/target|safe|allowed|disallowed/i);
  });

  it("rejects checksum mismatch", () => {
    const fixDir = join(root, "fix-package");
    mkdirSync(join(fixDir, "files"), { recursive: true });
    const body = "hello\n";
    writeFileSync(join(fixDir, "files/lib-example.ts"), body);
    writeFileSync(
      join(fixDir, "manifest.json"),
      JSON.stringify({
        schemaVersion: 1,
        mode: "patch",
        sourceRunId: "r2",
        patches: [],
        files: [
          {
            path: "files/lib-example.ts",
            target: "lib/example.ts",
            sha256: sha("not-the-body"),
          },
        ],
      }) + "\n",
    );
    writeFileSync(join(fixDir, "FIX.md"), "# fix\n");
    const v = validateFixPackage(fixDir);
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/checksum|sha256|mismatch/i);
  });

  it("accepts valid docs package", () => {
    const fixDir = writeFixPackage(root, {
      url: "https://example.com/c",
      slug: "pkg-c",
      failureClass: "docs_only",
      sourceRunId: "run-c",
      mode: "docs",
    });
    const v = validateFixPackage(fixDir);
    expect(v.ok).toBe(true);
    expect(v.mode).toBe("docs");
  });
});

describe("enqueueLinkedRetry", () => {
  let root: string;
  let queuePath: string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "enq-"));
    queuePath = join(root, "agent-queue.json");
    // Queue is a top-level array of items (see enqueueLinkedRetry).
    writeFileSync(queuePath, "[]\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("appends retry item with linked fix metadata", () => {
    const result = enqueueLinkedRetry({
      queuePath,
      sourceRunId: "src-1",
      url: "https://example.com/pkg",
      slug: "pkg",
      fixEntry: {
        fixId: "src-1-deadbeef",
        fixPackagePath: "/tmp/fix",
        branchName: "fix/pkg-123",
        commit: "deadbeefcafebabe",
      },
    });
expect(result.ok).toBe(true);
    expect(result.linkedFixId).toBe("src-1-deadbeef");
    const q = JSON.parse(readFileSync(queuePath, "utf8"));
    expect(Array.isArray(q)).toBe(true);
    expect(q.length).toBe(1);
    expect(q[0].status).toBe("retry");
    expect(q[0].linkedFixId).toBe("src-1-deadbeef");
    expect(q[0].sourceRunId).toBe("src-1");
    expect(q[0].url).toBe("https://example.com/pkg");
    // branch metadata may live on item or only in fix-index; linked fix id is required
    expect(result.retryQueueId).toBe(q[0].idx);
  });
});

describe("reconcileOne docs-mode skip", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "rec-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("skips docs packages without apply/promote", () => {
    writeFixPackage(root, {
      url: "https://example.com/d",
      slug: "pkg-d",
      failureClass: "needs_human",
      sourceRunId: "run-d",
      mode: "docs",
    });
    const r = reconcileOne(root, { dryRun: false, cleanup: true });
    expect(r.ok).toBe(true);
    expect(r.event).toBe("skipped_docs");
    expect(r.mode).toBe("docs");
  });

  it("returns dry_run for patch packages when dryRun=true", () => {
    writeFixPackage(root, {
      url: "https://example.com/e",
      slug: "pkg-e",
      failureClass: "patchable",
      sourceRunId: "run-e",
      files: [{ target: "lib/dry-run-target.ts", content: "export {};\n" }],
    });
    const r = reconcileOne(root, { dryRun: true, cleanup: true });
    expect(r.ok).toBe(true);
    expect(r.event).toBe("dry_run");
  });
});
