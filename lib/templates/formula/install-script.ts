import type { InstallScriptPayload } from "../../template-payload.ts";

export default function renderInstallScript(p: InstallScriptPayload): string {
  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
  url "${p.url}"
  sha256 "${p.sha256}"
  license "MIT"

${p.livecheckBlock}  depends_on "${p.allbrewDependency}"

  def install
    ENV["PREFIX"] = prefix.to_s
    ENV["DESTDIR"] = prefix.to_s
    ENV["HOME"] = buildpath.to_s
    system "bash", "${p.scriptFilename}"
    bin.install Dir[buildpath/"bin/*"] if (buildpath/"bin").exist?
    bin.install Dir[prefix/"bin/*"] if (prefix/"bin").exist?
  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
