import type { ArchiveBuildPayload } from "../../template-payload.ts";
import { codesignBlock } from "../codesign-block.ts";

export default function renderArchiveBuild(p: ArchiveBuildPayload): string {
  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
  url "${p.url}"
  sha256 "${p.sha256}"
${p.licenseLine}
${p.livecheckBlock}${p.allbrewDependency ? `  depends_on "${p.allbrewDependency}"\n` : ""}${p.dependenciesLines}  def install
${p.installBody}${codesignBlock(["libexec", "bin"])}
  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
