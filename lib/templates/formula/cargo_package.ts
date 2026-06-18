import type { CargoPackagePayload } from "../../template-payload.ts";

export default function renderCargoPackage(p: CargoPackagePayload): string {
  let ruby = `class ${p.className} < Formula\n`;
  ruby += `  desc "${p.desc}"\n`;
  ruby += `  homepage "${p.homepage}"\n`;
  ruby += p.licenseLine;
  ruby += p.urlLines;
  ruby += `  head "https://github.com/${p.fullName}.git", branch: "${p.defaultBranch}"\n\n`;

  ruby += p.livecheckBlock;
  ruby += `  depends_on "${p.allbrewDependency}"\n`;
  ruby += `  depends_on "rust" => :build\n\n`;

  ruby += `  def install\n`;
  ruby += `    system "cargo", "install", *std_cargo_args\n`;
  ruby += `  end\n\n`;

  ruby += p.serviceBlock;

  ruby += `  test do\n`;
  ruby += `    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")\n`;
  ruby += `  end\n`;
  ruby += `end\n`;

  return ruby;
}
