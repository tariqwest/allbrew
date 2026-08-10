import {
  toFormulaName,
  toClassName,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { hashUrl } from "../sha256.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import type { GemPackagePayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

export async function collectGemPackagePayload(
  gemName: string,
  repoInfo: any = null,
  options: any = {},
): Promise<GemPackagePayload> {
  const gemData = await fetchRubyGemsData(gemName);
  const version = gemData.version;
  const downloadUrl = gemData.gemUri;
  const sha256 = await hashUrl(downloadUrl);

  const name = options.name || toFormulaName(gemName);
  const className = toClassName(name);
  const desc =
    options.desc ||
    gemData.info ||
    repoInfo?.description ||
    `Install ${gemName} Ruby gem`;
  const homepage =
    gemData.homepageUri ||
    repoInfo?.homepage ||
    repoInfo?.htmlUrl ||
    `https://rubygems.org/gems/${gemName}`;
  const license = guessLicenseIdentifier(
    gemData.licenses?.[0] || repoInfo?.license,
  );

  const urlLines = `  url ${rubyString(downloadUrl)}\n  sha256 ${rubyString(sha256)}\n  version ${rubyString(version)}\n`;

  let primaryBin: string | null = options.binName || null;
  let hasExecutable = false;
  if (!primaryBin) {
    try {
      const exes = await fetchGemExecutables(downloadUrl);
      if (exes.length > 0) {
        primaryBin = exes[0];
        hasExecutable = true;
      }
    } catch {
      // fall back
    }
  } else {
    hasExecutable = true;
  }
  if (!primaryBin) primaryBin = gemName || name;
  if (!hasExecutable) {
    const exesFallback = await fetchGemExecutables(downloadUrl).catch(() => [] as string[]);
    hasExecutable = exesFallback.length > 0;
    if (hasExecutable) primaryBin = exesFallback[0];
  }

  const testBinName = rubyEscape(primaryBin);
  let testCommand: string;
  if (hasExecutable) {
    testCommand = `shell_output("#{bin}/${testBinName} --version")`;
  } else {
    const requireName = gemName.replace(/-/g, "/");
    testCommand = `shell_output("GEM_HOME=#{libexec} ruby -r ${requireName} -e \\"puts Gem.loaded_specs['${gemName}'].version\\"")`;
  }

  return {
    template: "gem_package",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    gemName: rubyString(gemName),
    version: rubyEscape(version),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    urlLines,
    livecheckBlock: rubyGemsLivecheckBlock(gemName),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName,
    testCommand,
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
  };
}

export async function generateGemPackage(
  gemName: string,
  repoInfo: any = null,
  options: any = {},
) {
  const payload = await collectGemPackagePayload(gemName, repoInfo, options);
  return writeRenderedFormula(payload, options.tapPath);
}

async function fetchRubyGemsData(gemName: string) {
  const base = process.env.RUBYGEMS_URL || "https://rubygems.org";
  const url = `${base}/api/v1/gems/${encodeURIComponent(gemName)}.json`;
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "allbrew/1.0" },
  });
  if (!response.ok) {
    throw new Error(`RubyGems lookup failed for ${gemName}: ${response.status}`);
  }
  const data = await response.json();
  if (!data.version || !data.gem_uri) {
    throw new Error(`Incomplete gem data for ${gemName}`);
  }
  return {
    version: data.version,
    gemUri: data.gem_uri,
    info: data.info,
    homepageUri: data.homepage_uri,
    licenses: data.licenses,
  };
}

async function fetchGemExecutables(gemUrl: string): Promise<string[]> {
  try {
    const res = await fetch(gemUrl, { headers: { "User-Agent": "allbrew/1.0" }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) return [];
    const buf = await res.arrayBuffer();
    const tmp = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = await tmp.mkdtemp(path.join(os.tmpdir(), "allbrew-gem-"));
    const gemPath = path.join(dir, "pkg.gem");
    await tmp.writeFile(gemPath, Buffer.from(buf));
    try {
      const zlib = await import("node:zlib");
      const fs = await import("node:fs");
      const gzPath = path.join(dir, "metadata.gz");
      const { execSync } = await import("node:child_process");
      execSync(`tar -xzf ${JSON.stringify(gemPath)} -C ${JSON.stringify(dir)} 2>/dev/null`, { timeout: 10000 });
      if (!fs.existsSync(gzPath)) {
        await tmp.rm(dir, { recursive: true, force: true });
        return [];
      }
      const gz = fs.readFileSync(gzPath);
      const yaml = zlib.gunzipSync(gz).toString("utf8");
      const exes: string[] = [];
      const m = yaml.match(/executables:\s*\n((?:- \s*\S+\s*\n?)+)/);
      if (m) {
        for (const line of m[1].split("\n")) {
          const mm = line.match(/-\s*(\S+)/);
          if (mm) exes.push(mm[1]);
        }
      } else {
        const inline = yaml.match(/executables:\s*\[([^\]]*)\]/);
        if (inline) {
          for (const tok of inline[1].split(",")) {
            const t = tok.trim().replace(/^["']|["']$/g, "");
            if (t) exes.push(t);
          }
        }
      }
      await tmp.rm(dir, { recursive: true, force: true });
      return exes;
    } catch {
      try { await tmp.rm(dir, { recursive: true, force: true }); } catch {}
      return [];
    }
  } catch {
    return [];
  }
}

function rubyGemsLivecheckBlock(gemName: string) {
  const base = process.env.RUBYGEMS_URL || "https://rubygems.org";
  const url = `${base}/api/v1/gems/${encodeURIComponent(gemName)}.json`;
  return (
    `  livecheck do\n` +
    `    url ${rubyString(url)}\n` +
    `    regex(/"version"\\s*:\\s*"v?([^"\\\\]+)"/i)\n` +
    `  end\n\n`
  );
}
