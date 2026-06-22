import type { SourceBuildPayload } from "../../template-payload.ts";

export default function renderSourceBuild(p: SourceBuildPayload): string {
  const pythonInclude = p.isPython ? "\n  include Language::Python::Virtualenv\n" : "";
  return `class ${p.className} < Formula${pythonInclude}
  desc "${p.desc}"
  homepage "${p.homepage}"
${p.licenseLine}${p.urlLines}  head "https://github.com/${p.fullName}.git", branch: "${p.defaultBranch}"

${p.livecheckBlock}  depends_on "${p.allbrewDependency}"
${p.dependenciesLines}
  def install
${p.installBody}  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
