import type { NpmPackagePayload } from "../../template-payload.ts";
import { codesignBlock } from "../codesign-block.ts";

export default function renderNpmPackage(p: NpmPackagePayload): string {
  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
  url "${p.url}"
  sha256 "${p.sha256}"
${p.licenseLine}
${p.livecheckBlock}  depends_on "${p.nodeVersion}"
${p.allbrewDependency ? `  depends_on "${p.allbrewDependency}"\n` : ""}
  def install
    system "npm", "install", ${p.stdNpmArgs}, "--min-release-age=0"
    bin.install_symlink libexec.glob("bin/*").select { |f| f.file? || f.symlink? }${codesignBlock(["libexec"])}
  end

${p.serviceBlock}  test do
${p.testDoBody}
  end
end
`;
}
