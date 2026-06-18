import type { SourceArchivePayload } from "../../template-payload.ts";

export default function renderSourceArchive(p: SourceArchivePayload): string {
  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
  url "${p.url}"
  sha256 "${p.sha256}"
  license "MIT"

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
