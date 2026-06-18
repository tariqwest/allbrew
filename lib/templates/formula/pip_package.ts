import type { PipPackagePayload } from "../../template-payload.ts";

export default function renderPipPackage(p: PipPackagePayload): string {
  let ruby = `class ${p.className} < Formula\n`;
  ruby += `  include Language::Python::Virtualenv\n\n`;
  ruby += `  desc "${p.desc}"\n`;
  ruby += `  homepage "${p.homepage}"\n`;
  ruby += `  url "${p.url}"\n`;
  ruby += `  sha256 "${p.sha256}"\n`;
  ruby += p.licenseLine;
  ruby += `\n`;
  ruby += p.livecheckBlock;
  ruby += `  depends_on "${p.allbrewDependency}"\n`;
  ruby += `  depends_on "python@3.13"\n\n`;

  ruby += p.resourcesBlock;

  ruby += `  def install\n`;
  ruby += `    virtualenv_install_with_resources\n`;
  ruby += `  end\n\n`;

  ruby += p.serviceBlock;

  ruby += `  test do\n`;
  ruby += `    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")\n`;
  ruby += `  end\n`;
  ruby += `end\n`;

  return ruby;
}
