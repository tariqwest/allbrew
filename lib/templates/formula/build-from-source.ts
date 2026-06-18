import type { BuildFromSourcePayload } from "../../template-payload.ts";

export default function renderBuildFromSource(p: BuildFromSourcePayload): string {
  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
${p.licenseLine}${p.urlLines}  head "https://github.com/${p.fullName}.git", branch: "${p.defaultBranch}"

  depends_on "${p.allbrewDependency}"
${p.dependenciesLines}
  def install
${p.installBody}  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
