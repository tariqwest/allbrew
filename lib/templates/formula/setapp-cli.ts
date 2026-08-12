import type { SetappCliPayload } from "../../template-payload.ts";

export default function renderSetappCli(p: SetappCliPayload): string {
  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
${p.licenseLine}  version "${p.version}"

${p.platformBlocks}  livecheck do
    url :stable
    strategy :github_latest
  end

${p.allbrewDependency ? `  depends_on "${p.allbrewDependency}"\n\n` : ""}  def install
    ensure_setapp!
    ${p.installBody}
  end

  def ensure_setapp!
    return if setapp_installed?

    ohai "Setapp is required — installing via Homebrew cask"
    # Cask::CaskLoader.load(...).install is not a public API and raises
    # NoMethodError on modern Homebrew (Cask instances have no #install).
    system HOMEBREW_BREW_FILE, "install", "--cask", "setapp"
  end

  def setapp_installed?
    [
      Pathname.new("/Applications/Setapp.app"),
      Pathname.new(Dir.home)/"Applications"/"Setapp.app",
    ].any?(&:directory?)
  end

  def caveats
    <<~EOS
      setapp-cli requires Setapp.app. An existing install (including a direct
      download) is used when present; otherwise the setapp cask is installed.
    EOS
  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
