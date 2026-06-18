import {
  toFormulaName,
  toClassName,
  rubyEscape,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { downloadAndHash } from "../sha256.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import type { ScriptInstallPayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

export async function collectScriptInstallPayload(
  url: string,
  options: any = {},
): Promise<ScriptInstallPayload> {
  const { sha256 } = await downloadAndHash(url);

  const filename = url.split("/").pop().split("?")[0] || "install.sh";
  const baseName = filename.replace(/\.(sh|bash)$/i, "");
  const name = options.name || toFormulaName(baseName);
  const className = toClassName(name);
  const desc = options.desc || `Install ${baseName} via setup script`;

  return {
    template: "script_install",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(url),
    url: rubyEscape(url),
    sha256: rubyEscape(sha256),
    scriptFilename: rubyEscape(filename),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(name),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
  };
}

export async function generateScriptInstall(url: string, options: any = {}) {
  const payload = await collectScriptInstallPayload(url, options);
  return writeRenderedFormula(payload, options.tapPath);
}
