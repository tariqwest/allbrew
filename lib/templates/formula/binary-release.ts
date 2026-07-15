import type { BinaryReleasePayload } from "../../template-payload.ts";

export default function renderBinaryRelease(p: BinaryReleasePayload): string {
  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
${p.licenseLine}  version "${p.version}"

${p.platformBlocks}  livecheck do
    url :stable
    strategy :github_latest
  end

${p.allbrewDependency ? `  depends_on "${p.allbrewDependency}"\n\n` : ""}  def install
    bin.install "${p.binName}"
  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
