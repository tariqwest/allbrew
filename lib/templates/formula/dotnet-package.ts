import type { DotnetPackagePayload } from "../../template-payload.ts";

export default function renderDotnetPackage(p: DotnetPackagePayload): string {
  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
${p.licenseLine}${p.urlLines}
${p.livecheckBlock}${p.allbrewDependency ? `  depends_on "${p.allbrewDependency}"\n` : ""}  depends_on "dotnet"

  def install
    (buildpath/"nupkg").install cached_download
    system "dotnet", "tool", "install", ${p.packageName}, "--tool-path", "#{bin}", "--version", version.to_s, "--add-source", buildpath/"nupkg"
    bin.env_script_all_files(libexec, DOTNET_ROOT: Formula["dotnet"].opt_libexec)
  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
