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

/**
 * Prefer common Go layout cmd/<name> (or single cmd/*) when the module root
 * has no main package. Pure helper so unit tests do not need GitHub.
 */
export function resolveGoBuildPackage(
  formulaName: string,
  repoName: string | null | undefined,
  cmdEntries: Array<{ name: string; type?: string }> | null | undefined,
  optionsPackage?: string | null,
): string {
  if (optionsPackage != null && typeof optionsPackage === "string") {
    const cleaned = optionsPackage.replace(/^\.\//, "").replace(/\/$/, "");
    if (!cleaned) return "";
    return cleaned.startsWith("./") ? cleaned : `./${cleaned}`;
  }
  if (!cmdEntries?.length) return "";

  const dirs = cmdEntries
    .filter((e) => !e.type || e.type === "dir" || e.type === "tree")
    .map((e) => e.name)
    .filter(Boolean);

  if (!dirs.length) return "";

  const candidates = [formulaName, repoName, toFormulaName(repoName || "")]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());

  for (const cand of candidates) {
    const hit = dirs.find((d) => d.toLowerCase() === cand);
    if (hit) return `./cmd/${hit}`;
  }

  // Single cmd subdir (e.g. only cmd/picoshare) — use it.
  if (dirs.length === 1) return `./cmd/${dirs[0]}`;

  return "";
}

async function detectGoBuildPackage(
  ghFullName: string | null | undefined,
  formulaName: string,
  repoName: string | null | undefined,
  options: any,
): Promise<string> {
  if (options.goBuildPackage != null) {
    return resolveGoBuildPackage(
      formulaName,
      repoName,
      null,
      options.goBuildPackage,
    );
  }
  if (Array.isArray(options.cmdEntries)) {
    return resolveGoBuildPackage(
      formulaName,
      repoName,
      options.cmdEntries,
      null,
    );
  }
  if (!ghFullName || !ghFullName.includes("/")) return "";
  const [owner, repo] = ghFullName.split("/");
  try {
    // Lazy import so unit tests that mock sha256 only do not need octokit.
    const { getRepoContents } = await import("../github.ts");
    const entries = await getRepoContents(owner, repo, "cmd");
    if (!Array.isArray(entries) || !entries.length) return "";
    return resolveGoBuildPackage(formulaName, repoName, entries, null);
  } catch {
    return "";
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

  const goBuildPackage = await detectGoBuildPackage(
    ghFullName,
    name,
    repoInfo?.name,
    options,
  );

  const testBinName = rubyEscape(options.binName || name);
  // Many Go daemons (picoshare) have no --version and treat unknown flags as fatal.
  // Prefer existence check when building a cmd/ subpackage or when options say so.
  const testBody =
    options.testBody != null
      ? String(options.testBody)
      : goBuildPackage || options.skipVersionTest
        ? `    assert_path_exists bin/"${testBinName}"\n`
        : `    assert_match version.to_s, shell_output("#{bin}/${testBinName} --version")\n`;

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
    testBinName,
    goBuildPackage: rubyEscape(goBuildPackage),
    testBody,
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
