/**
 * Shared Ruby `def install` block that finds Mach-O executables under the
 * Homebrew install prefix and re-signs them with an adhoc signature.
 *
 * Pre-built binaries from GitHub releases / npm tarballs / archives are often
 * adhoc-signed on a CI machine. macOS code-signing enforcement kills them with
 * SIGKILL on execution (`cs_invalid_page ... denying page sending SIGKILL`)
 * because the embedded signature does not match the local machine.
 * Re-signing with `codesign --force --sign -` produces a valid local adhoc
 * signature so the binary can run.
 *
 * @param dirs Directories to scan (relative to the formula install prefix),
 *   e.g. `["libexec", "bin"]`. Defaults to `["libexec", "bin"]`.
 * @returns Ruby source lines (indented for placement inside `def install`).
 */
export function codesignBlock(dirs: string[] = ["libexec", "bin"]): string {
  const dirVars = dirs
    .map((d) => `${d}`)
    .join(", ");

  return [
    ``,
    `    return unless OS.mac?`,
    ``,
    `    search_dirs = [${dirVars}].select { |d| d.respond_to?(:directory?) ? d.directory? : Dir.exist?(d.to_s) }.map(&:to_s)`,
    `    return if search_dirs.empty?`,
    ``,
    `    mach_o = Utils.safe_popen_read(`,
    `      "/usr/bin/find", *search_dirs, "-type", "f", "-perm", "+111", "-print0"`,
    `    ).split("\\0").reject(&:empty?).select do |path|`,
    `      Utils.safe_popen_read("/usr/bin/file", "-b", path).include?("Mach-O")`,
    `    rescue`,
    `      false`,
    `    end`,
    ``,
    `    mach_o.each do |path|`,
    `      system "/usr/bin/xattr", "-cr", path`,
    `      system "/usr/bin/codesign", "--force", "--sign", "-", path`,
    `    end`,
  ].join("\n");
}
