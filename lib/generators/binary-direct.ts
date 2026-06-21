import {
  toFormulaName,
  toClassName,
  rubyEscape,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import { urlVersionLivecheckBlock } from "./livecheck.ts";
import type { BinaryDirectPayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

export async function collectBinaryDirectPayload(
  archiveInfo: any,
  selectedBinaries: any = null,
  options: any = {},
): Promise<BinaryDirectPayload> {
  const { downloadUrl, sha256, binaries, extras = {} } = archiveInfo;

  const bins = selectedBinaries || binaries;
  if (!bins || bins.length === 0) {
    throw new Error("No binary executables found in archive");
  }

  const filename = downloadUrl.split("/").pop().split("?")[0] || "binary";
  const baseName = filename
    .replace(/\.tar\.(gz|bz2|xz)$/i, "")
    .replace(/\.(tgz|zip)$/i, "")
    .replace(/-[\d.]+$/, "");

  const name = options.name || toFormulaName(baseName);
  const className = toClassName(name);
  const desc = options.desc || `Install ${baseName}`;
  const primaryBin = bins[0].split("/").pop();

  return {
    template: "binary_direct",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(downloadUrl),
    url: rubyEscape(downloadUrl),
    sha256: rubyEscape(sha256),
    installBody: buildInstallBody(bins, extras),
    livecheckBlock: urlVersionLivecheckBlock(downloadUrl),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(primaryBin),
    serviceBlock: buildServiceBlock(
      serviceFromOptions(options, primaryBin),
      primaryBin,
    ),
  };
}

function buildInstallBody(
  bins: string[],
  extras: { manPages?: string[]; completions?: string[]; licenses?: string[] },
) {
  let body = "";
  for (const bin of bins) {
    const binName = bin.split("/").pop();
    if (bin.includes("/")) {
      body += `    bin.install "${rubyEscape(bin)}" => "${rubyEscape(binName!)}"\n`;
    } else {
      body += `    bin.install "${rubyEscape(binName!)}"\n`;
    }
  }

  if (extras.manPages && extras.manPages.length > 0) {
    body += `\n`;
    for (const manPage of extras.manPages) {
      const section = manPage.match(/\.(\d)$/)?.[1] || "1";
      body += `    man${section}.install "${rubyEscape(manPage)}"\n`;
    }
  }

  if (extras.completions && extras.completions.length > 0) {
    body += `\n`;
    for (const comp of extras.completions) {
      const lower = comp.toLowerCase();
      if (lower.endsWith(".bash") || lower.includes("bash")) {
        body += `    bash_completion.install "${rubyEscape(comp)}"\n`;
      } else if (lower.endsWith(".zsh") || lower.includes("zsh")) {
        body += `    zsh_completion.install "${rubyEscape(comp)}"\n`;
      } else if (lower.endsWith(".fish") || lower.includes("fish")) {
        body += `    fish_completion.install "${rubyEscape(comp)}"\n`;
      }
    }
  }

  if (extras.licenses && extras.licenses.length > 0) {
    body += `\n`;
    for (const lic of extras.licenses) {
      body += `    share.install "${rubyEscape(lic)}"\n`;
    }
  }

  return body;
}

export async function generateBinaryDirect(
  archiveInfo: any,
  selectedBinaries: any = null,
  options: any = {},
) {
  const payload = await collectBinaryDirectPayload(
    archiveInfo,
    selectedBinaries,
    options,
  );
  return writeRenderedFormula(payload, options.tapPath);
}
