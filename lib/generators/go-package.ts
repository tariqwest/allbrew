import {
  toFormulaName,
  toClassName,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
  assertSafeFetchUrl,
} from "../utils.ts";
import { hashUrl } from "../sha256.ts";
import { goModuleLivecheckBlock } from "./livecheck.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import type { GoPackagePayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

function goProxyUrl(): string {
  return process.env.GO_PROXY_URL || "https://proxy.golang.org";
}

function githubModuleFullName(goModule: string): string | null {
  const match = goModule.match(/^github\.com\/([^/]+\/[^/]+)$/);
  return match ? match[1] : null;
}

async function fetchGoProxyInfo(
  goModule: string,
): Promise<{ version: string; sourceUrl: string } | null> {
  const latestUrl = `${goProxyUrl()}/${goModule}/@latest`;
  assertSafeFetchUrl(latestUrl);
  try {
    const res = await fetch(latestUrl);
    if (!res.ok) return null;
    const data = (await res.json()) as { Version?: string };
    const version = data.Version;
    if (!version) return null;

    const sourceUrl = `${goProxyUrl()}/${goModule}/@v/${version}.zip`;
    return { version, sourceUrl };
  } catch {
    return null;
  }
}

export async function collectGoPackagePayload(
  repoInfo: any,
  release: any = null,
  options: any = {},
): Promise<GoPackagePayload> {
  const goModule =
    options.goModule || (repoInfo ? `github.com/${repoInfo.fullName}` : "");
  const ghFullName = githubModuleFullName(goModule) || repoInfo?.fullName;

  const name =
    options.name ||
    toFormulaName(
      repoInfo?.name || goModule.split("/").pop() || "unknown",
    );
  const className = toClassName(name);
  const desc =
    options.desc ||
    repoInfo?.description ||
    (goModule ? `Install ${goModule}` : `Install ${name}`);
  const license = guessLicenseIdentifier(
    repoInfo?.license || options.license || null,
  );
  const homepage =
    options.homepage ||
    repoInfo?.homepage ||
    repoInfo?.htmlUrl ||
    (ghFullName ? `https://github.com/${ghFullName}` : `https://${goModule}`);

  let urlLines = "";
  if (release?.tarballUrl || release?.tagName) {
    const sourceUrl =
      release.tarballUrl ||
      `https://github.com/${ghFullName}/archive/refs/tags/${release.tagName}.tar.gz`;
    const sha256 = await hashUrl(sourceUrl);
    urlLines = `  url ${rubyString(sourceUrl)}\n  sha256 ${rubyString(sha256)}\n`;
  } else {
    const proxyInfo = await fetchGoProxyInfo(goModule);
    if (proxyInfo) {
      const sha256 = await hashUrl(proxyInfo.sourceUrl);
      urlLines = `  url ${rubyString(proxyInfo.sourceUrl)}\n  sha256 ${rubyString(sha256)}\n`;
    }
  }

  return {
    template: "go_package",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    fullName: rubyEscape(ghFullName || ""),
    defaultBranch: rubyEscape(repoInfo?.defaultBranch || "main"),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    urlLines,
    livecheckBlock: goModuleLivecheckBlock(goModule),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(options.binName || name),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
  };
}

export async function generateGoPackage(
  repoInfo: any,
  release: any = null,
  options: any = {},
) {
  const payload = await collectGoPackagePayload(repoInfo, release, options);
  return writeRenderedFormula(payload, options.tapPath);
}
