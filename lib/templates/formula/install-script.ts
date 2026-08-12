import type { InstallScriptPayload } from "../../template-payload.ts";

export default function renderInstallScript(p: InstallScriptPayload): string {
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
    # (commonly ~/.local/bin). Sandbox HOME so those paths stay inside the buildpath.
    ENV["HOME"] = buildpath.to_s
    # Common generic override accepted by some installers.
    ENV["BIN_DIR"] = (buildpath/"bin").to_s
    # Warp Agent CLI honors WARP_TUI_* (defaults to $HOME/.warp and $HOME/.local/bin);
    # point them inside buildpath so the versioned layout is discoverable.
    ENV["WARP_TUI_INSTALL_DIR"] = (buildpath/"warp-tui").to_s
    ENV["WARP_TUI_BIN_DIR"] = (buildpath/"bin").to_s
    system "bash", cached_download.to_s

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
      bins = Dir[buildpath/"**/*"].select do |f|
        File.file?(f) && File.executable?(f) && !File.basename(f).start_with?(".")
      end
      odie "install script produced no executable binaries under buildpath" if bins.empty?
      bin.install bins
    end
    if "${p.testBinName}" != "${p.name}" && (bin/"${p.testBinName}").exist? && !(bin/"${p.name}").exist?
      bin.install_symlink "${p.testBinName}" => "${p.name}"
    end
  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
