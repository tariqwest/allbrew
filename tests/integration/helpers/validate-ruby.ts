/**
 * Lightweight structural validators for generated Homebrew Ruby.
 * Validates via regex — no Ruby interpreter required.
 */

export type ValidationResult = { ok: boolean; errors: string[] };

export function validateFormula(ruby: string): ValidationResult {
  const errors: string[] = [];

  if (!/^class \w+ < Formula\n/.test(ruby))
    errors.push("Missing 'class <Name> < Formula' header");

  if (!/\n  desc "/.test(ruby)) errors.push("Missing desc stanza");
  if (!/\n  homepage "/.test(ruby)) errors.push("Missing homepage stanza");
  if (
    !/\n  url "/.test(ruby) &&
    !/\n  head "/.test(ruby) &&
    !/\n    on_arm do\n/.test(ruby)
  )
    errors.push("Missing url/head stanza or platform-specific url block");

  if (!/\n  def install\n/.test(ruby)) errors.push("Missing def install block");
  if (!/\n  test do\n/.test(ruby)) errors.push("Missing test do block");
  if (!/\nend\n$/.test(ruby)) errors.push("Missing closing 'end'");

  if (/\n{3,}/.test(ruby)) errors.push("Found triple+ blank lines");
  if (/  depends_on ""\n/.test(ruby)) errors.push("Empty depends_on string");
  if (/  url ""\n/.test(ruby)) errors.push("Empty url string");
  if (/  sha256 ""\n/.test(ruby)) errors.push("Empty sha256 string");

  return { ok: errors.length === 0, errors };
}

export function validateCask(ruby: string): ValidationResult {
  const errors: string[] = [];

  if (!/^cask "\w[\w-]*" do\n/.test(ruby))
    errors.push("Missing 'cask \"<token>\" do' header");

  if (!/\n  sha256 /.test(ruby)) errors.push("Missing sha256 stanza");
  if (!/\n  url "/.test(ruby)) errors.push("Missing url stanza");
  if (!/\n  name "/.test(ruby)) errors.push("Missing name stanza");
  if (!/\n  desc "/.test(ruby)) errors.push("Missing desc stanza");
  if (!/\nend\n$/.test(ruby)) errors.push("Missing closing 'end'");

  if (/\n{3,}/.test(ruby)) errors.push("Found triple+ blank lines");
  if (/  sha256 ""\n/.test(ruby)) errors.push("Empty sha256 string");
  if (/  url ""\n/.test(ruby)) errors.push("Empty url string");

  return { ok: errors.length === 0, errors };
}

export function assertValidFormula(ruby: string): void {
  const { ok, errors } = validateFormula(ruby);
  if (!ok) throw new Error(`Invalid formula Ruby:\n  ${errors.join("\n  ")}`);
}

export function assertValidCask(ruby: string): void {
  const { ok, errors } = validateCask(ruby);
  if (!ok) throw new Error(`Invalid cask Ruby:\n  ${errors.join("\n  ")}`);
}
