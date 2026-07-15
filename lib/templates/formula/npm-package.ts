import type { NpmPackagePayload } from "../../template-payload.ts";

export default function renderNpmPackage(p: NpmPackagePayload): string {
  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
  url "${p.url}"
  sha256 "${p.sha256}"
${p.licenseLine}
${p.livecheckBlock}  depends_on "node"
${p.allbrewDependency ? `  depends_on "${p.allbrewDependency}"\n` : ""}
  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
