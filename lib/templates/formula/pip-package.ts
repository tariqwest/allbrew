import type { PipPackagePayload } from "../../template-payload.ts";

export default function renderPipPackage(p: PipPackagePayload): string {
  return `class ${p.className} < Formula
  include Language::Python::Virtualenv

  desc "${p.desc}"
  homepage "${p.homepage}"
  url "${p.url}"
  sha256 "${p.sha256}"
${p.licenseLine}
${p.livecheckBlock}${p.allbrewDependency ? `  depends_on "${p.allbrewDependency}"\n` : ""}  depends_on "python@3.13"

${p.resourcesBlock}  def install
    virtualenv_install_with_resources
  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
