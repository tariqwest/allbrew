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

  // Prefer explicit bin override. Otherwise inspect gemspec executables from the
  // downloaded .gem metadata. Confirmed empty → library gem (version shim).
  // Fetch failure → legacy assumption that gemName is an executable.
  let primaryBin = options.binName || gemName || name;
  let libraryShim = false;
  if (!options.binName) {
    const exeResult = await fetchGemExecutables(downloadUrl);
    if (exeResult.ok) {
      if (exeResult.executables.length > 0) {
        primaryBin = exeResult.executables[0];
      } else {
        libraryShim = true;
        primaryBin = gemName || name;
      }
    }
  }

  const testBinName = rubyEscape(primaryBin);
  const requireName = gemName.replace(/-/g, "/");
  const libraryShimBlock = libraryShim
    ? buildLibraryShimBlock(primaryBin, gemName, requireName)
    : "";

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
    // Gem executables usually match the gem name (underscores), not the
    // hyphenated Homebrew formula token (e.g. license_finder vs license-finder).
    testBinName,
    libraryShimBlock,
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

function buildLibraryShimBlock(
  binName: string,
  gemName: string,
  requireName: string,
): string {
  // Install a libexec bin that prints the gem version so keg + verify have a
  // runnable binary. env_script_all_files then wraps it into #{bin}.
  const safeBin = rubyEscape(binName);
  const safeGem = rubyEscape(gemName);
  const safeReq = rubyEscape(requireName);
  return (
    `    # Library gem (no gemspec executables): install a version shim.\n` +
    `    (libexec/"bin").mkpath\n` +
    `    (libexec/"bin"/"${safeBin}").write <<~EOS\n` +
    `      #!/usr/bin/env ruby\n` +
    `      # frozen_string_literal: true\n` +
    `      require "${safeReq}"\n` +
    `      puts Gem.loaded_specs["${safeGem}"].version\n` +
    `    EOS\n` +
    `    chmod 0755, libexec/"bin"/"${safeBin}"\n`
  );
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

type GemExeResult =
  | { ok: true; executables: string[] }
  | { ok: false };

/**
 * Download a .gem and parse `executables:` from metadata.gz.
 * Returns ok:false on network/parse failure so callers can fall back.
 */
async function fetchGemExecutables(gemUrl: string): Promise<GemExeResult> {
  try {
    const res = await fetch(gemUrl, {
      headers: { "User-Agent": "allbrew/1.0" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return { ok: false };
    const buf = await res.arrayBuffer();
    const fsP = await import("node:fs/promises");
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const zlib = await import("node:zlib");
    const { execSync } = await import("node:child_process");
    const dir = await fsP.mkdtemp(path.join(os.tmpdir(), "allbrew-gem-"));
    const gemPath = path.join(dir, "pkg.gem");
    await fsP.writeFile(gemPath, Buffer.from(buf));
    try {
      execSync(
        `tar -xzf ${JSON.stringify(gemPath)} -C ${JSON.stringify(dir)} 2>/dev/null`,
        { timeout: 10000 },
      );
      const gzPath = path.join(dir, "metadata.gz");
      if (!fs.existsSync(gzPath)) {
        await fsP.rm(dir, { recursive: true, force: true });
        return { ok: false };
      }
      const yaml = zlib.gunzipSync(fs.readFileSync(gzPath)).toString("utf8");
      const exes = parseGemspecExecutables(yaml);
      await fsP.rm(dir, { recursive: true, force: true });
      return { ok: true, executables: exes };
    } catch {
      try {
        await fsP.rm(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      return { ok: false };
    }
  } catch {
    return { ok: false };
  }
}

/** Exported for unit tests. */
export function parseGemspecExecutables(yaml: string): string[] {
  const exes: string[] = [];
  // Block form:
  // executables:
  // - pry
  // - pry-remote
  const block = yaml.match(/executables:\s*\n((?:[ \t]*- [^\n]+\n?)*)/);
  if (block && block[1].trim()) {
    for (const line of block[1].split("\n")) {
      const mm = line.match(/^\s*-\s*(\S+)\s*$/);
      if (mm) exes.push(mm[1].replace(/^["']|["']$/g, ""));
    }
    return exes;
  }
  // Inline form: executables: []  or  executables: [pry, foo]
  const inline = yaml.match(/executables:\s*\[([^\]]*)\]/);
  if (inline) {
    for (const tok of inline[1].split(",")) {
      const t = tok.trim().replace(/^["']|["']$/g, "");
      if (t) exes.push(t);
    }
    return exes;
  }
  // Bare empty: executables:
  if (/executables:\s*(?:#.*)?$/m.test(yaml) || /executables:\s*\n\S/.test(yaml)) {
    // Only treat as empty if next non-empty key is not a list item — already handled.
    if (/executables:\s*$/m.test(yaml.split("\n").find((l) => l.includes("executables:")) || "")) {
      return [];
    }
  }
  return exes;
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
