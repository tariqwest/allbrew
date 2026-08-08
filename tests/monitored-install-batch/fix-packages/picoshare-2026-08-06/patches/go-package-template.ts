import type { GoPackagePayload } from "../../template-payload.ts";

export default function renderGoPackage(p: GoPackagePayload): string {
  const buildExtra = p.goBuildPackage ? `, "${p.goBuildPackage}"` : "";
  const testInner =
    p.testBody ||
    `    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")\n`;
  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
${p.licenseLine}${p.urlLines}  head "https://github.com/${p.fullName}.git", branch: "${p.defaultBranch}"

${p.livecheckBlock}${p.allbrewDependency ? `  depends_on "${p.allbrewDependency}"\n` : ""}  depends_on "go" => :build

  def install
    system "go", "build", *std_go_args(ldflags: "-s -w")${buildExtra}
  end

${p.serviceBlock}  test do
${testInner}  end
end
`;
}
