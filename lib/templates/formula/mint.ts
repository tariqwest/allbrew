import type { MintPayload } from "../../template-payload.ts";

export default function renderMint(p: MintPayload): string {
  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
${p.licenseLine}${p.urlLines}  head "https://github.com/${p.fullName}.git", branch: "${p.defaultBranch}"

${p.livecheckBlock}  depends_on "${p.allbrewDependency}"
  depends_on "mint"

  def install
    ENV["MINT_PATH"] = "#{buildpath}/.mint"
    system "mint", "install", "${p.fullName}@#{version}"
    bin.install Dir["#{buildpath}/.mint/packages/${p.fullName}/#{version}/bin/*"]
  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
