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
  // Match only documented CLI options — never bare substring checks.
  // `text.includes("-y")` false-positives on `apt-get install -y` (agent-deck).
  const flagCandidates = [
    "--non-interactive",
    "--skip-tmux-config",
    "--yes",
    "-y",
  ];
  for (const flag of flagCandidates) {
    const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const isShort =
      flag.length === 2 && flag.startsWith("-") && !flag.startsWith("--");
    const shortLetter = isShort ? flag.slice(1) : null;
    const documented = isShort
      ? new RegExp(
          [
            `(?:^|[\\s|])${escaped}(?:\\)|\\|)`,
            `(?:\\|)${escaped}\\)`,
            `${escaped}\\s*,\\s*--[a-z]`,
            `--[a-z][\\w-]*\\s*,\\s*${escaped}`,
            `\\[${escaped}\\]`,
            shortLetter ? `getopts\\s+["'][^"']*${shortLetter}` : null,
          ]
            .filter(Boolean)
            .join("|"),
          "im",
        )
      : new RegExp(
          [
            `(?:^|[\\s\\[|,"'])${escaped}(?:[\\s\\]|,"']|$)`,
            `${escaped}\\)`,
          ].join("|"),
          "im",
        );
    if (documented.test(text) && !args.includes(flag)) {
      args.push(flag);
    }
  }

  if (/--non-interactive/.test(text) && !args.includes("--non-interactive")) {
    args.unshift("--non-interactive");
  }

  // Prefer --yes over -y when both detected
  if (args.includes("--yes") && args.includes("-y")) {
    args.splice(args.indexOf("-y"), 1);
  }

  return { args, env, ensureBinDir };
}

/**
 * Choose shell for `system "...", cached_download`.
 * Starship refuses non-POSIX bash and documents `#!/usr/bin/env sh`.
 */
export function detectInstallScriptShell(scriptText: string): "sh" | "bash" {
  const text = String(scriptText || "");
  const firstLine = (text.split(/\r?\n/, 1)[0] || "").trim();
  if (/^#!/.test(firstLine)) {
    if (/\bbash\b/.test(firstLine)) return "bash";
    if (/\b(zsh|fish|ksh)\b/.test(firstLine)) return "sh";
    if (/\bsh\b/.test(firstLine)) return "sh";
  }
  if (
    /POSIXLY_CORRECT/.test(text) &&
    (/non-POSIX/.test(text) ||
      /Please use [`']sh[`']/.test(text) ||
      /use `sh` instead/i.test(text))
  ) {
    return "sh";
  }
  return "bash";
}

function installScriptRubyFragments(
  flags: ReturnType<typeof detectInstallScriptFlags>,
  shell: "sh" | "bash",
): {
  installEnvLines: string;
  installArgsRuby: string;
  ensureBinDir: boolean;
  scriptShell: "sh" | "bash";
} {
  const envLines = Object.entries(flags.env)
    .map(([k, v]) => `    ENV[${rubyString(k)}] = ${rubyString(v)}\n`)
    .join("");
  const argsRuby = flags.args.map((a) => `, ${rubyString(a)}`).join("");
  return {
    installEnvLines: envLines,
    installArgsRuby: argsRuby,
    ensureBinDir: flags.ensureBinDir,
    scriptShell: shell,
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
  const shell: "sh" | "bash" =
    options.scriptShell === "sh" || options.scriptShell === "bash"
      ? options.scriptShell
      : scriptText
        ? detectInstallScriptShell(scriptText)
        : "bash";
  const rubyBits = installScriptRubyFragments(flags, shell);

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
    scriptShell: rubyBits.scriptShell,
  };
}

export async function generateInstallScript(url: string, options: any = {}) {
  const payload = await collectInstallScriptPayload(url, options);
  return writeRenderedFormula(payload, options.tapPath);
}
