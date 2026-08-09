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
    system "bash", cached_download.to_s

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
