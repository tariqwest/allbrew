import type { BuildFromSourcePayload } from "../../template-payload.ts";

export default function renderBuildFromSource(p: BuildFromSourcePayload): string {
  let ruby = `class ${p.className} < Formula\n`;
  ruby += `  desc "${p.desc}"\n`;
  ruby += `  homepage "${p.homepage}"\n`;
  ruby += p.licenseLine;
  ruby += p.urlLines;
  ruby += `  head "https://github.com/${p.fullName}.git", branch: "${p.defaultBranch}"\n\n`;

  ruby += `  depends_on "${p.allbrewDependency}"\n`;
  ruby += p.dependenciesLines;
  ruby += `\n`;

  ruby += `  def install\n`;
  ruby += p.installBody;
  ruby += `  end\n\n`;

  ruby += p.serviceBlock;

  ruby += `  test do\n`;
  ruby += `    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")\n`;
  ruby += `  end\n`;
  ruby += `end\n`;

  return ruby;
}
