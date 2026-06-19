import type { DotnetToolPayload } from "../../template-payload.ts";

export default function renderDotnetTool(p: DotnetToolPayload): string {
  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
${p.licenseLine}${p.urlLines}
${p.livecheckBlock}  depends_on "${p.allbrewDependency}"
  depends_on "dotnet"

  def install
    system "dotnet", "tool", "install", ${p.packageName}, "--tool-path", "#{bin}", "--version", version.to_s
  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
