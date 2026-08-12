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

function detectGoBuildPath(repoInfo: any, name: string, goModule: string): string {
  const files: string[] = repoInfo?._files || repoInfo?._fileList || [];
  const hasFile = (path: string) => files.includes(path) || files.some((f) => f === path || f.endsWith("/" + path));
  if (hasFile(`cmd/${name}/main.go`) || hasFile(`cmd/${name}`)) return `./cmd/${name}`;
  if (files.some((f) => f.startsWith("cmd/") && f.endsWith("main.go"))) {
    const match = files.find((f) => f.startsWith(`cmd/${name}/`));
    if (match) return `./cmd/${name}`;
    const firstCmd = files.find((f) => f.startsWith("cmd/") && f.endsWith("main.go"));
    if (firstCmd) {
      const dir = firstCmd.replace(/\/main\.go$/, "");
      return `./${dir}`;
    }
  }
  if (goModule.includes("goatcounter") || name === "goatcounter") return "./cmd/goatcounter";
  return ".";
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
  // Normalize go install specs like github.com/foo/bar@latest → path only
  const rawGoModule =
    options.goModule || (repoInfo ? `github.com/${repoInfo.fullName}` : "");
  const goModule = String(rawGoModule || "").replace(/@[\w.+\-]+$/, "") || rawGoModule;
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

  const goBuildPath = options.goBuildPath || detectGoBuildPath(repoInfo, name, goModule);
  const testCommand = options.testCommand || (name === "goatcounter" ? "version" : "--version");

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
    goBuildPath,
    testCommand,
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
