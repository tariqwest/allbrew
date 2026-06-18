import type { BinaryReleasePayload } from "../../template-payload.ts";

export default function renderBinaryRelease(p: BinaryReleasePayload): string {
  let ruby = `class ${p.className} < Formula\n`;
  ruby += `  desc "${p.desc}"\n`;
  ruby += `  homepage "${p.homepage}"\n`;
  ruby += p.licenseLine;
  ruby += `  version "${p.version}"\n`;
  ruby += `\n`;
  ruby += p.platformBlocks;

  ruby += `  livecheck do\n`;
  ruby += `    url :stable\n`;
  ruby += `    strategy :github_latest\n`;
  ruby += `  end\n\n`;

  ruby += `  depends_on "${p.allbrewDependency}"\n`;
  ruby += `\n`;

  ruby += `  def install\n`;
  ruby += `    bin.install "${p.binName}"\n`;
  ruby += `  end\n\n`;

  ruby += p.serviceBlock;

  ruby += `  test do\n`;
  ruby += `    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")\n`;
  ruby += `  end\n`;
  ruby += `end\n`;

  return ruby;
}
