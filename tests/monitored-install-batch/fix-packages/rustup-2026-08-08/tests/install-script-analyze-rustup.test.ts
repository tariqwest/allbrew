import { describe, expect, test } from "bun:test";
import {
  analyzeInstallScript,
  packageHintFromInstallUrl,
} from "../../lib/install-script-analyze.ts";
import { formatBottleCellar } from "../../lib/generators/homebrew-formula.ts";
import { resolveExistingHomebrewClassification } from "../../lib/utils.ts";

const RUSTUP_URL = "https://sh.rustup.rs";

const RUSTUP_BOOTSTRAP_SNIPPET = [
  "#!/bin/sh",
  "# install rustup. downloads the installer",
  'RUSTUP_UPDATE_ROOT="${RUSTUP_UPDATE_ROOT:-https://static.rust-lang.org/rustup}"',
  "usage() {",
  "    cat <<EOF",
  "rustup-init 1.29.0",
  "The installer for rustup",
  "EOF",
  "}",
  "main() {",
  '    local _url="${RUSTUP_UPDATE_ROOT}/dist/${_arch}/rustup-init"',
  '    downloader "$_url" "$_file"',
  '    ignore "$_file" "$@"',
  "}",
  'main "$@" || exit 1',
].join("\n");

describe("packageHintFromInstallUrl rustup", () => {
  test("sh.rustup.rs → rustup", () => {
    expect(packageHintFromInstallUrl(RUSTUP_URL)).toBe("rustup");
  });
});

describe("analyzeInstallScript rustup bootstrap", () => {
  test("classifies as home-dir-installer with packageHint rustup", () => {
    const a = analyzeInstallScript(RUSTUP_URL, RUSTUP_BOOTSTRAP_SNIPPET);
    expect(a.kind).toBe("home-dir-installer");
    expect(a.packageHint).toBe("rustup");
    expect(a.signals).toContain("rustup-bootstrap");
  });

  test("body-only detection without host still flags rustup-init", () => {
    const a = analyzeInstallScript(
      "https://example.com/install.sh",
      RUSTUP_BOOTSTRAP_SNIPPET,
    );
    expect(a.kind).toBe("home-dir-installer");
    expect(a.packageHint).toBe("rustup");
  });
});

describe("Case C resolve for rustup", () => {
  test("homebrew/core has formula rustup", () => {
    const hit = resolveExistingHomebrewClassification("rustup");
    expect(hit?.type).toBe("homebrew-formula");
    expect(hit?.name).toBe("rustup");
  });
});

describe("formatBottleCellar", () => {
  test("does not double-colon API symbols", () => {
    expect(formatBottleCellar(":any_skip_relocation")).toBe(
      ":any_skip_relocation",
    );
    expect(formatBottleCellar("any_skip_relocation")).toBe(
      ":any_skip_relocation",
    );
    expect(formatBottleCellar(":any_skip_relocation")).not.toMatch(/^::/);
  });
});
