import {
  toFormulaName,
  toClassName,
  rubyEscape,
  rubyString,
  guessLicenseIdentifier,
  extractVersionFromTag,
} from "../utils.ts";
import { downloadAndHash } from "../sha256.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import { urlVersionLivecheckBlock } from "./livecheck.ts";
import type { InstallScriptPayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

function extractVersionFromUrl(url: string): string | null {
  const match = String(url).match(/[/-]v?(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.]+)?)/);
  return match ? match[1] : null;
}

/**
 * Detect noninteractive flags/env that install scripts document.
 * Used so brew sandbox builds do not hang on `read` / confirm prompts.
 */
export function detectInstallScriptFlags(scriptText: string): {
  args: string[];
  env: Record<string, string>;
  ensureBinDir: boolean;
} {
  const text = String(scriptText || "");
  const args: string[] = [];
  const env: Record<string, string> = {};

  // Always pre-create BIN_DIR: starship and similar require the directory to exist.
  const ensureBinDir = true;

  if (/\bFORCE\b/.test(text) || /\$\{?FORCE\}?/.test(text)) {
    env.FORCE = "1";
  }
  if (/\bYES\b/.test(text) && /confirm|prompt|read\s+/i.test(text)) {
    env.YES = "1";
  }

  // Longest / most specific flags first to avoid partial matches.
  const flagCandidates = [
    "--non-interactive",
    "--skip-tmux-config",
    "--yes",
    "-y",
  ];
  for (const flag of flagCandidates) {
    // Require the flag to appear as a documented option, not only in prose.
    const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `(?:^|[\\s"'|])${escaped}(?:\\s|$|["'])|case\\s+.*${escaped}|getopts.*${escaped.replace(/^--?/, "")}`,
      "im",
    );
    if (re.test(text) || text.includes(flag)) {
      if (!args.includes(flag)) args.push(flag);
    }
  }

  // agent-deck and similar: explicit non-interactive mode
  if (/non.interactive/i.test(text) && !args.includes("--non-interactive")) {
    if (/--non-interactive/.test(text)) args.unshift("--non-interactive");
  }

  // Prefer --yes over -y when both detected
  if (args.includes("--yes") && args.includes("-y")) {
    args.splice(args.indexOf("-y"), 1);
  }

  // Deno install.sh (and similar): --yes/-y enable post-install *shell setup*
  // (interactive PATH wiring), not non-interactive install. Passing them under
  // brew makes the formula hang or fail after the binary is already staged.
  // Drop those flags when the script ties them to shell-setup, or uses DENO_INSTALL.
  const yesEnablesShellSetup =
    /should_run_shell_setup/i.test(text) ||
    (/\bDENO_INSTALL\b/.test(text) &&
      /(?:-y|--yes)/.test(text) &&
      /shell.?setup|installer-shell-setup/i.test(text));
  if (yesEnablesShellSetup) {
    for (const flag of ["--yes", "-y"]) {
      const i = args.indexOf(flag);
      if (i >= 0) args.splice(i, 1);
    }
  }

  return { args, env, ensureBinDir };
}

function installScriptRubyFragments(flags: ReturnType<typeof detectInstallScriptFlags>): {
  installEnvLines: string;
  installArgsRuby: string;
  ensureBinDir: boolean;
} {
  const envLines = Object.entries(flags.env)
    .map(([k, v]) => `    ENV[${rubyString(k)}] = ${rubyString(v)}\n`)
    .join("");
  const argsRuby = flags.args.map((a) => `, ${rubyString(a)}`).join("");
  return {
    installEnvLines: envLines,
    installArgsRuby: argsRuby,
    ensureBinDir: flags.ensureBinDir,
  };
}

/** Resolve a Homebrew-safe version for static install-script URLs. */
export async function resolveInstallScriptVersion(
  url: string,
  options: any = {},
): Promise<string> {
  if (options.version) return extractVersionFromTag(String(options.version));

  const fromUrl = extractVersionFromUrl(url);
  if (fromUrl) return fromUrl;

  const releaseTag = options.repoInfo?.releaseTag || options.release?.tagName;
  if (releaseTag) return extractVersionFromTag(String(releaseTag));

  // raw.githubusercontent.com/owner/repo/ref/path → use ref if version-like, else latest release
  try {
    const u = new URL(url);
    if (u.hostname === "raw.githubusercontent.com") {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 3) {
        const [owner, repo, ref] = parts;
        if (/^v?\d/.test(ref)) return extractVersionFromTag(ref);
        const { getLatestRelease } = await import("../github.ts");
        const release = await getLatestRelease(owner, repo);
        if (release?.tagName) return extractVersionFromTag(release.tagName);
      }
    }
  } catch {
    /* ignore network / parse errors */
  }

  // Homebrew requires a non-nil version; livecheck can still move it later.
  return "0.0.1";
}

export async function collectInstallScriptPayload(
  url: string,
  options: any = {},
): Promise<InstallScriptPayload> {
  const { sha256 } = await downloadAndHash(url);

  const filename = url.split("/").pop().split("?")[0] || "install.sh";
  const baseName = filename.replace(/\.(sh|bash)$/i, "");
  const name = options.name || toFormulaName(baseName);
  const className = toClassName(name);
  const desc = options.desc || `Install ${baseName} via setup script`;
  const repoInfo = options.repoInfo;
  const license = guessLicenseIdentifier(options.license || repoInfo?.license || null);
  const version = await resolveInstallScriptVersion(url, options);
  let binName = options.binName || name;
  let scriptText = "";
  try {
    scriptText = await (
      await fetch(url, { signal: AbortSignal.timeout(15_000) })
    ).text();
  } catch {
    /* optional */
  }
  if (!options.binName && /agent-cli/i.test(url) && /warp/i.test(name) && scriptText) {
    const m = scriptText.match(/CLI_NAME\s*=\s*["']?([A-Za-z0-9._-]+)["']?/);
    if (m?.[1]) binName = m[1];
  }

  const flags =
    options.installFlags ||
    (scriptText
      ? detectInstallScriptFlags(scriptText)
      : { args: [] as string[], env: {} as Record<string, string>, ensureBinDir: true });
  // Allow explicit option overrides
  if (options.force === true) flags.env.FORCE = "1";
  if (Array.isArray(options.scriptArgs)) {
    for (const a of options.scriptArgs) {
      if (!flags.args.includes(a)) flags.args.push(a);
    }
  }
  const rubyBits = installScriptRubyFragments(flags);

  return {
    template: "install_script",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(url),
    url: rubyEscape(url),
    version: rubyEscape(version),
    sha256: rubyEscape(sha256),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    scriptFilename: rubyEscape(filename),
    livecheckBlock: urlVersionLivecheckBlock(url),
    allbrewDependency: "",
    testBinName: rubyEscape(binName),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
    installEnvLines: rubyBits.installEnvLines,
    installArgsRuby: rubyBits.installArgsRuby,
    ensureBinDir: rubyBits.ensureBinDir,
  };
}

export async function generateInstallScript(url: string, options: any = {}) {
  const payload = await collectInstallScriptPayload(url, options);
  return writeRenderedFormula(payload, options.tapPath);
}
