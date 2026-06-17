import {
  toFormulaName,
  toClassName,
  rubyString,
  writeFormula,
} from "../utils.js";
import { downloadAndHash } from "../sha256.js";
import { buildServiceBlock, serviceFromOptions } from "./service.js";

export async function generateScriptInstall(url, options = {}) {
  const { sha256 } = await downloadAndHash(url);

  const filename = url.split("/").pop().split("?")[0] || "install.sh";
  const baseName = filename.replace(/\.(sh|bash)$/i, "");
  const name = options.name || toFormulaName(baseName);
  const className = toClassName(name);
  const desc = options.desc || `Install ${baseName} via setup script`;

  let ruby = `class ${className} < Formula\n`;
  ruby += `  desc ${rubyString(desc)}\n`;
  ruby += `  homepage ${rubyString(url)}\n`;
  ruby += `  url ${rubyString(url)}\n`;
  ruby += `  sha256 ${rubyString(sha256)}\n`;
  ruby += `  license "MIT"\n\n`;

  ruby += `  def install\n`;
  ruby += `    ENV["PREFIX"] = prefix.to_s\n`;
  ruby += `    ENV["DESTDIR"] = prefix.to_s\n`;
  ruby += `    ENV["HOME"] = buildpath.to_s\n`;
  ruby += `    system "bash", "${filename}"\n`;
  ruby += `    bin.install Dir[buildpath/"bin/*"] if (buildpath/"bin").exist?\n`;
  ruby += `    bin.install Dir[prefix/"bin/*"] if (prefix/"bin").exist?\n`;
  ruby += `  end\n\n`;

  ruby += buildServiceBlock(serviceFromOptions(options, name), name);

  ruby += `  test do\n`;
  ruby += `    assert_match version.to_s, shell_output("#{bin}/${name} --version")\n`;
  ruby += `  end\n`;
  ruby += `end\n`;

  const filePath = await writeFormula(name, ruby, options.tapPath);
  return { filePath, name, className, type: "formula" };
}
