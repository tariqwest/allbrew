import type { InstallScriptPayload } from "../../template-payload.ts";

export default function renderInstallScript(p: InstallScriptPayload): string {
  const extraEnv = (p as any).extraEnvLines || "";
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
    ENV["HOME"] = buildpath.to_s
    # Common installer knobs so scripts that ignore PREFIX still land in the Cellar.
    ENV["INSTALL_DIR"] = bin.to_s
    ENV["XDG_BIN_HOME"] = bin.to_s
${extraEnv}    system "bash", cached_download.to_s
    bin.install Dir[buildpath/"bin/*"] if (buildpath/"bin").exist?
    bin.install Dir[buildpath/".local/bin/*"] if (buildpath/".local/bin").exist?
  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
