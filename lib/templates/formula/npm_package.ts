import type { NpmPackagePayload } from "../../template-payload.ts";

export default function renderNpmPackage(p: NpmPackagePayload): string {
  let ruby = `class ${p.className} < Formula\n`;
  ruby += `  desc "${p.desc}"\n`;
  ruby += `  homepage "${p.homepage}"\n`;
  ruby += `  url "${p.url}"\n`;
  ruby += `  sha256 "${p.sha256}"\n`;
  ruby += p.licenseLine;
  ruby += `\n`;
  ruby += p.livecheckBlock;
  ruby += `  depends_on "node"\n`;
  ruby += `  depends_on "${p.allbrewDependency}"\n`;
  ruby += `\n`;

  ruby += `  def install\n`;
  ruby += `    system "npm", "install", *std_npm_args\n`;
  ruby += `    bin.install_symlink libexec.glob("bin/*")\n`;
  ruby += `  end\n\n`;

  ruby += p.serviceBlock;

  ruby += `  test do\n`;
  ruby += `    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")\n`;
  ruby += `  end\n`;
  ruby += `end\n`;

  return ruby;
}
