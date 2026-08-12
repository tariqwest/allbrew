import type { SourceBuildPayload } from "../../template-payload.ts";

export default function renderSourceBuild(p: SourceBuildPayload): string {
  const pythonInclude = p.isPython ? "\n  include Language::Python::Virtualenv\n" : "";
  const resources = p.resourcesBlock || "";
  return `class ${p.className} < Formula${pythonInclude}
  desc "${p.desc}"
  homepage "${p.homepage}"
${p.licenseLine}${p.urlLines}  head "https://github.com/${p.fullName}.git", branch: "${p.defaultBranch}"

${p.livecheckBlock}${p.allbrewDependency ? `  depends_on "${p.allbrewDependency}"\n` : ""}${p.dependenciesLines}${resources}  def install
${p.installBody}  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
