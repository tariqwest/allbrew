import type { ScriptInstallPayload } from "../../template-payload.ts";

export default function renderScriptInstall(p: ScriptInstallPayload): string {
  let ruby = `class ${p.className} < Formula\n`;
  ruby += `  desc "${p.desc}"\n`;
  ruby += `  homepage "${p.homepage}"\n`;
  ruby += `  url "${p.url}"\n`;
  ruby += `  sha256 "${p.sha256}"\n`;
  ruby += `  license "MIT"\n\n`;

  ruby += `  depends_on "${p.allbrewDependency}"\n`;
  ruby += `\n`;

  ruby += `  def install\n`;
  ruby += `    ENV["PREFIX"] = prefix.to_s\n`;
  ruby += `    ENV["DESTDIR"] = prefix.to_s\n`;
  ruby += `    ENV["HOME"] = buildpath.to_s\n`;
  ruby += `    system "bash", "${p.scriptFilename}"\n`;
  ruby += `    bin.install Dir[buildpath/"bin/*"] if (buildpath/"bin").exist?\n`;
  ruby += `    bin.install Dir[prefix/"bin/*"] if (prefix/"bin").exist?\n`;
  ruby += `  end\n\n`;

  ruby += p.serviceBlock;

  ruby += `  test do\n`;
  ruby += `    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")\n`;
  ruby += `  end\n`;
  ruby += `end\n`;

  return ruby;
}
