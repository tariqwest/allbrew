import type { InstallScriptPayload } from "../../template-payload.ts";
import { codesignBlock } from "../codesign-block.ts";

export default function renderInstallScript(p: InstallScriptPayload): string {
  const ensureBin = p.ensureBinDir
    ? `    system "mkdir", "-p", ENV.fetch("BIN_DIR")\n`
    : "";
  const envExtra = p.installEnvLines || "";
  const args = p.installArgsRuby || "";
  const shell = p.scriptShell === "sh" ? "sh" : "bash";

  const scriptInvocation = p.installScriptRewrite
    ? `    # Vendor the script so we can rewrite hard-coded install paths and strip sudo.
    script = buildpath/"allbrew-install.sh"
    cp cached_download, script
    chmod 0755, script

    content = File.read(script)
    # Rewrite hard-coded INSTALL_DIR/BIN_DIR assignments to the formula bin while
    # preserving an optional leading "readonly" keyword and the surrounding spacing.
    content.gsub!(%r{(readonly\\s+)?(INSTALL_DIR|BIN_DIR|install_dir|BINDIR)(\\s*=\\s*)["']?[^"'$\\s]+["']?}, "\\\\1\\\\2\\\\3'#{bin}'")
    # Strip common sudo install patterns that break inside the Homebrew sandbox.
    content.gsub!(%r{\\$\\(command -v sudo \\|\\| true\\)\\s*}, "")
    content.gsub!(%r{\\bsudo\\s+(?:bash|sh|cp|mv|mkdir|tar|unzip|install|tee)\\b}, "")
    File.write(script, content)

    system "${shell}", script.to_s${args}
`
    : `    system "${shell}", cached_download.to_s${args}
`;

  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
  url "${p.url}"
  version "${p.version}"
  sha256 "${p.sha256}"
${p.licenseLine}
${p.livecheckBlock}${p.allbrewDependency ? `  depends_on "${p.allbrewDependency}"\n\n` : ""}  def install
    ENV["PREFIX"] = prefix.to_s
    ENV["DESTDIR"] = prefix.to_s
    # Many vendor installers honor PREFIX/DESTDIR; others ignore them and write under $HOME
    # (commonly ~/.local/bin or ~/.<tool>/bin). Sandbox HOME so those paths stay inside buildpath.
    ENV["HOME"] = buildpath.to_s
    # Common generic override accepted by some installers.
    ENV["BIN_DIR"] = (buildpath/"bin").to_s
    ENV["INSTALL_DIR"] = (buildpath/"bin").to_s
    # Skip shell profile edits inside the sandbox; app-specific *_NO_MODIFY_PATH may override.
    ENV["NO_MODIFY_PATH"] = "1"
    # Warp Agent CLI honors WARP_TUI_* (defaults to $HOME/.warp and $HOME/.local/bin);
    # point them inside buildpath so the versioned layout is discoverable.
    ENV["WARP_TUI_INSTALL_DIR"] = (buildpath/"warp-tui").to_s
    ENV["WARP_TUI_BIN_DIR"] = (buildpath/"bin").to_s
${envExtra}${ensureBin}${scriptInvocation}
    # Warp Agent CLI uses a versioned layout: $WARP_TUI_INSTALL_DIR/warp-tui/versions/<version>/warp-tui-stable
    # with a symlink $WARP_TUI_BIN_DIR/warp -> .../current/warp-tui-stable. The symlink target
    # is under buildpath and would be broken after install, so install the real binary directly.
    warp_bin = Dir[buildpath/"warp-tui"/"versions"/"*"/"warp-tui-*"].select { |f| File.file?(f) && File.executable?(f) }.first
    if warp_bin
      bin.install warp_bin => "warp"
      # Also ensure the versioned layout's resources are available if needed (optional)
      # The installer already staged everything under warp-tui/ — Homebrew only needs the binary.
      return
    end

    candidates = [
      buildpath/"bin",
      buildpath/".local/bin",
      buildpath/"usr/local/bin",
      Pathname.new(ENV.fetch("PREFIX"))/"bin",
    ].uniq
    # Add any dot-prefixed tool home bin/ directories the installer created (e.g. ~/.volta/bin).
    Dir.glob(File.join(buildpath, ".*", "bin")).each do |d|
      base = File.basename(File.dirname(d))
      next if base == "." || base == ".."
      candidates << Pathname.new(d)
    end
    candidates.uniq!
    installed = false
    candidates.each do |dir|
      next unless dir.directory?
      bins = Dir[dir/"*"].select { |f| File.file?(f) && File.executable?(f) }
      next if bins.empty?
      # If the only bin is a broken symlink (warp -> warp-tui/...), resolve to the real binary.
      # Homebrew's bin.install would copy the symlink as-is, leaving a broken link.
      # For warp, the real binary is already handled above; for others, install as-is.
      bin.install bins
      installed = true
      break
    end
    unless installed
      # FNM_DOTMATCH so files under ~/.<tool>/... are found (Dir.glob skips dotdirs by default).
      bins = Dir.glob(File.join(buildpath, "**", "*"), File::FNM_DOTMATCH).select do |f|
        base = File.basename(f)
        next false if base == "." || base == ".."
        File.file?(f) && File.executable?(f) && !base.start_with?(".")
      end
      odie "install script produced no executable binaries under buildpath" if bins.empty?
      bin.install bins
    end${codesignBlock(["libexec", "bin"])}
  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
