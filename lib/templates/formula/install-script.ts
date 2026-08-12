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
    # Stage bin dir so installers that require BIN_DIR to already exist (e.g. starship
    # check_bin_dir) succeed inside the sandbox.
    (buildpath/"bin").mkpath
    # Common generic override accepted by some installers.
    ENV["BIN_DIR"] = (buildpath/"bin").to_s
    # Non-interactive: starship/railway-family (FORCE/--yes) and other CI-aware installers skip prompts.
    ENV["FORCE"] = "1"
    ENV["CI"] = "1"
    # Railway CLI (starship-family installer) honors RAILWAY_BIN_DIR / RAILWAY_HOME over BIN_DIR.
    # Point them at buildpath so the prebuilt binary lands under candidates, not ~/.railway/bin.
    ENV["RAILWAY_BIN_DIR"] = (buildpath/"bin").to_s
    ENV["RAILWAY_HOME"] = buildpath.to_s
    # Warp Agent CLI honors WARP_TUI_* (defaults to $HOME/.warp and $HOME/.local/bin);
    # point them inside buildpath so the versioned layout is discoverable.
    ENV["WARP_TUI_INSTALL_DIR"] = (buildpath/"warp-tui").to_s
    ENV["WARP_TUI_BIN_DIR"] = (buildpath/"bin").to_s
    # Avoid interactive hangs: probe the script for non-interactive flags and pass them
    # only when present so unknown scripts don't fail with "Unknown option".
    script = cached_download.to_s
    script_content = File.read(script) rescue ""
    extra_args = []
    if script_content.include?("--non-interactive")
      extra_args << "--non-interactive"
    elsif script_content.match?(/(?:^|\\s)(?:-y|--yes|--force)\\b/)
      extra_args << "-y"
    elsif script_content.include?("--skip-tmux-config")
      extra_args << "--skip-tmux-config"
    end
    system "bash", script, *extra_args

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
      buildpath/".railway/bin",
      buildpath/"usr/local/bin",
      Pathname.new(ENV.fetch("PREFIX"))/"bin",
    ].uniq
    # Harvest any ~/.product/bin layout under the sandboxed HOME (dotdirs are invisible to Dir["**/*"]).
    Dir[buildpath/".*"].each do |dot|
      next unless File.directory?(dot)
      next if [".", ".."].include?(File.basename(dot))
      bin_cand = Pathname.new(dot)/"bin"
      candidates << bin_cand if bin_cand.directory?
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
      bins = Dir[buildpath/"**/*"].select do |f|
        File.file?(f) && File.executable?(f) && !File.basename(f).start_with?(".")
      end
      odie "install script produced no executable binaries under buildpath" if bins.empty?
      bin.install bins
    end
  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
