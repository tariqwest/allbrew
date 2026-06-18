import type { RawBinaryPayload } from "../../template-payload.ts";

export default function renderRawBinary(p: RawBinaryPayload): string {
  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
  url "${p.url}"
  sha256 "${p.sha256}"
  license "MIT"

${p.livecheckBlock}  depends_on "${p.allbrewDependency}"

  def install
${p.installBody}  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
