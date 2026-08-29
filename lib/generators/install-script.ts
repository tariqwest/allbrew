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

const UNKNOWN_VERSION = "0.0.1";

function extractVersionFromUrl(url: string): string | null {
  const match = String(url).match(/[/-]v?(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.]+)?)/);
  return match ? match[1] : null;
}

/**
 * Best-effort parse of CLI binary name from vendor install scripts.
 * Many one-liner installers derive a generic filename (install.sh) so the
 * real binary name must be read from the script body.
 */
export function detectBinNameFromInstallScript(
  scriptText: string | null | undefined,
): string | null {
  if (!scriptText) return null;
  const patterns = [
    /\bbin_name\s*=\s*["']([A-Za-z0-9._-]+)["']/,
    /\bCLI_NAME\s*=\s*["']?([A-Za-z0-9._-]+)["']?/,
    /\bBINARY_NAME\s*=\s*["']?\$\{(?:BINARY_NAME)?:-([A-Za-z0-9._-]+)\}["']?/,
    /\bBINARY_NAME\s*=\s*["']?([A-Za-z0-9._-]+)["']?/,
    /\bAPP_NAME\s*=\s*["']?([A-Za-z0-9._-]+)["']?/,
    /\bBIN\s*=\s*["']([A-Za-z0-9._-]+)["']/,
  ];
  for (const re of patterns) {
    const m = scriptText.match(re);
    if (m?.[1] && m[1].length < 64) return m[1];
  }
  return null;
}

export type InstallScriptValueArg = {
  arg: string;
  value: string;
};

export type InstallScriptFlags = {
  args: string[];
  env: Record<string, string>;
  ensureBinDir: boolean;
  valueArgs: InstallScriptValueArg[];
  installScriptRewrite?: boolean;
};

type FlagKind =
  | "boolean"
  | "version"
  | "path"
  | "literal";

type FlagDef = {
  arg: string;
  env?: string;
  kind: FlagKind;
  literal?: string;
};

// Catalog of common documented install-script flags.  Long flags are preferred
// to short flags to avoid false positives (e.g. `-p` meaning "platform" in one
// script and "prefix" in another).  Value-flag values are rendered as raw Ruby
// in the formula template so `version` / `buildpath` resolve at build time.
const FLAG_CATALOG: FlagDef[] = [
  // non-interactive / confirmation suppression
  { arg: "--yes", env: "YES", kind: "boolean" },
  { arg: "-y", kind: "boolean" },
  { arg: "--no", env: "NO", kind: "boolean" },
  { arg: "--non-interactive", env: "NONINTERACTIVE", kind: "boolean" },
  { arg: "--noninteractive", env: "NONINTERACTIVE", kind: "boolean" },
  { arg: "--no-confirm", kind: "boolean" },
  { arg: "--no-prompt", kind: "boolean" },
  { arg: "--force", env: "FORCE", kind: "boolean" },
  { arg: "-f", env: "FORCE", kind: "boolean" },
  { arg: "--accept-license", env: "ACCEPT_LICENSE", kind: "boolean" },
  // quiet output
  { arg: "--quiet", env: "QUIET", kind: "boolean" },
  { arg: "-q", env: "QUIET", kind: "boolean" },
  { arg: "--silent", env: "SILENT", kind: "boolean" },
  // skip PATH / shell modifications
  { arg: "--no-modify-path", env: "NO_MODIFY_PATH", kind: "boolean" },
  { arg: "--skip-path", kind: "boolean" },
  { arg: "--no-profile", kind: "boolean" },
  { arg: "--skip-setup", kind: "boolean" },
  { arg: "--skip-tmux-config", kind: "boolean" },
  // version pinning (value = formula version)
  { arg: "--version", kind: "version" },
  // install destination (value = buildpath bin staging dir)
  { arg: "--to", kind: "path" },
  { arg: "--install-dir", kind: "path" },
  { arg: "--install-to", kind: "path" },
  { arg: "--prefix", kind: "path" },
  { arg: "--bin-dir", kind: "path" },
  // rustup-style toolchain selection (literal defaults avoid heavy downloads)
  { arg: "--default-toolchain", kind: "literal", literal: "none" },
  { arg: "--profile", kind: "literal", literal: "minimal" },
];

/**
 * Returns true when `flag` is a documented option in the script, not just a
 * bare substring.  We look at usage lines, case arms, and getopts strings.
 */
function isFlagDocumented(text: string, flag: string): boolean {
  const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const isShort = flag.length === 2 && flag.startsWith("-") && !flag.startsWith("--");

  if (isShort) {
    const shortLetter = flag.slice(1);
    const re = new RegExp(
      [
        // case arm: -y) or -y|--yes) or -y | --force)
        `(?:^|[\\s|])${escaped}(?:\\s*\\||\\s*\\))`,
        // paired with long form in help text: -y, --yes / --yes, -y
        `${escaped}\\s*,\\s*--[a-z]`,
        `--[a-z][\\w-]*\\s*,\\s*${escaped}`,
        // usage [ -y ]
        `\\[${escaped}\\]`,
        // getopts optstring containing the letter
        `getopts\\s+["'][^"']*${shortLetter}`,
      ]
        .filter(Boolean)
        .join("|"),
      "im",
    );
    return re.test(text);
  }

  const re = new RegExp(
    [
      // usage / help line where the flag is the first token (leading whitespace allowed)
      // and is followed by a description, placeholder, or end of line.
      `(?:^\\s*)${escaped}(?=\\s+(?:<[^>]+>|\\[[^\\]]+\\]|\\$\\{[A-Z_]+\\}|[A-Z_][A-Z0-9_]{1,}|\\w[^\\n]*)|\\s*$)`,
      // usage [ --flag ]
      `\\[${escaped}\\]`,
      // case arm: --non-interactive)
      `${escaped}\\)`,
      // paired with short form
      `${escaped}\\s*,\\s*-[a-zA-Z]`,
      `-[a-zA-Z]\\s*,\\s*${escaped}`,
    ]
      .filter(Boolean)
      .join("|"),
    "im",
  );
  return re.test(text);
}

/**
 * For value flags, verify the script actually takes a value by looking for a
 * placeholder, `=$2`/`$2` assignment, or an `=` form.
 */
function flagTakesValue(text: string, flag: string): boolean {
  const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    // usage: --version <version>, --version [version], --version VERSION
    `${escaped}\\s+(?:<[^>]+>|\\[[^\\]]+\\]|\\$\\{[A-Z_]+\\}|[A-Z_][A-Z0-9_]{1,})`,
    // --version=... or -v=...
    `${escaped}\\s*=`,
    // case arm with $2 assignment within the next few lines
    `${escaped}\\)\\s*(?:\\n\\s*){0,3}[^\\n]*=\\s*"\\$2"`,
    `${escaped}\\)\\s*(?:\\n\\s*){0,3}[^\\n]*shift 2`,
  ];
  return new RegExp(patterns.filter(Boolean).join("|"), "m").test(text);
}

function getFlagLine(text: string, flag: string): string {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(flag)) {
      // Include the next line in case the description is wrapped (rustup style).
      return [lines[i], lines[i + 1] || ""].join("\n");
    }
  }
  return "";
}

function valueFlagDescribesInstallPath(line: string): boolean {
  const lower = line.toLowerCase();
  return /\b(?:prefix|install|directory|dir|path|bin|location|to)\b/.test(lower);
}

function valueFlagDescribesVersion(line: string): boolean {
  const lower = line.toLowerCase();
  return /\b(?:version|install.*version|specific release|target version)\b/.test(lower);
}

/**
 * Decide whether the vendor install script hardcodes paths or uses sudo in a
 * way that requires us to vendor and rewrite it.  Starship-style scripts that
 * honor BIN_DIR or accept --bin-dir are left alone.
 */
function shouldRewriteForHomebrew(scriptText: string): boolean {
  const text = String(scriptText || "");
  if (!text) return false;

  // readonly INSTALL_DIR/BIN_DIR cannot be overridden with ENV.
  if (/\breadonly\s+(?:INSTALL_DIR|BIN_DIR|install_dir|BINDIR)\s*=/i.test(text)) {
    return true;
  }

  // Sudo-driven install commands are not allowed inside the brew build.
  if (/\$\(command -v sudo \|\| true\)/.test(text)) return true;
  if (/\bsudo\s+(?:bash|sh|cp|mv|mkdir|tar|unzip|install|tee)\b/i.test(text)) {
    return true;
  }

  return false;
}

/**
 * Detect non-interactive flags and common environment variables documented in
 * an install script.  Returns both the argument list and environment overrides
 * that should be set inside `def install`.
 */
export function detectInstallScriptFlags(
  scriptText: string,
  binName: string = "bin",
): InstallScriptFlags {
  const text = String(scriptText || "");
  const args: string[] = [];
  const env: Record<string, string> = {};
  const valueArgs: InstallScriptValueArg[] = [];

  // Always pre-create BIN_DIR: starship and similar require the directory to exist.
  const ensureBinDir = true;

  // Generic confirmation / CI env variables.
  if (/\bFORCE\b/.test(text) || /\$\{?FORCE\}?/.test(text)) {
    env.FORCE = "1";
  }
  if (/\bYES\b/.test(text) && /confirm|prompt|read\s+/i.test(text)) {
    env.YES = "1";
  }
  if (/\bNO\b/.test(text) && /confirm|prompt|read\s+/i.test(text)) {
    env.NO = "1";
  }
  if (/\bNONINTERACTIVE\b/i.test(text)) {
    env.NONINTERACTIVE = "1";
  }
  if (/\bCI\b/.test(text) && /\b(?:CI|non.?interactive|prompt|confirm)\b/i.test(text)) {
    env.CI = "1";
  }
  if (/\bACCEPT_LICENSE\b/i.test(text)) {
    env.ACCEPT_LICENSE = "1";
  }

  for (const def of FLAG_CATALOG) {
    if (!isFlagDocumented(text, def.arg)) continue;

    if (def.kind === "boolean") {
      if (!args.includes(def.arg)) args.push(def.arg);
      if (def.env) env[def.env] = "1";
      continue;
    }

    if (!flagTakesValue(text, def.arg)) {
      // A value flag was documented but the usage does not show a value (e.g.
      // `rustup --version` is a print-version flag).  Skip it.
      continue;
    }

    const line = getFlagLine(text, def.arg);

    if (def.kind === "version") {
      if (valueFlagDescribesVersion(line) || /\$2|=<[A-Z_]+>/.test(line)) {
        valueArgs.push({ arg: def.arg, value: "version.to_s" });
      }
      continue;
    }

    if (def.kind === "path") {
      if (valueFlagDescribesInstallPath(line)) {
        valueArgs.push({ arg: def.arg, value: "(buildpath/\"bin\").to_s" });
      }
      continue;
    }

    if (def.kind === "literal" && def.literal) {
      valueArgs.push({ arg: def.arg, value: rubyString(def.literal) });
    }
  }

  // Avoid passing both -y and --yes when the script supports both.
  if (args.includes("--yes") && args.includes("-y")) {
    args.splice(args.indexOf("-y"), 1);
  }
  if (args.includes("--force") && args.includes("-f")) {
    args.splice(args.indexOf("-f"), 1);
  }

  // Promote non-interactive mode to the front of the argument list.
  if (args.includes("--non-interactive")) {
    args.splice(args.indexOf("--non-interactive"), 1);
    args.unshift("--non-interactive");
  }

  // Detect and set common install-path / no-modify-path / quiet env variables.
  // Capture prefixed forms (UV_INSTALL_DIR, VOLTA_HOME) and a small allow-list of
  // bare forms (INSTALL_DIR, BIN_DIR, BINDIR, NO_MODIFY_PATH, NO_MODIFY, INSTALL).
  // Bare HOME/DIR/QUIET/SILENT are too generic and are handled by explicit flags above.
  const envPattern =
    /\b((?:[A-Z][A-Z0-9_]*_)(?:NO_MODIFY_PATH|NO_MODIFY|QUIET|SILENT|INSTALL_DIR|INSTALL_PATH|INSTALL|BIN_DIR|BINDIR|HOME|DIR)|(?:NO_MODIFY_PATH|NO_MODIFY|INSTALL_DIR|INSTALL_PATH|INSTALL|BIN_DIR|BINDIR))\b/g;
  const envNames = [...text.matchAll(envPattern)].map((m) => m[1]);
  const seen = new Set<string>();
  for (const name of envNames) {
    if (seen.has(name)) continue;
    seen.add(name);

    if (/_NO_MODIFY_PATH$/.test(name) || /_NO_MODIFY$/.test(name)) {
      env[name] = "1";
    } else if (/_QUIET$/.test(name) || /_SILENT$/.test(name)) {
      env[name] = "1";
    } else if (
      /_INSTALL_DIR$/.test(name) ||
      /_BIN_DIR$/.test(name) ||
      /_BINDIR$/.test(name) ||
      name === "INSTALL_DIR" ||
      name === "BIN_DIR" ||
      name === "BINDIR"
    ) {
      env[name] = '(buildpath/"bin").to_s';
    } else if (/_INSTALL_PATH$/.test(name) || name === "INSTALL_PATH") {
      env[name] = `(buildpath/"bin"/${rubyString(binName)}).to_s`;
    } else if (/_INSTALL$/.test(name) || name === "INSTALL") {
      // e.g. DENO_INSTALL: a top-level directory where the script appends /bin.
      env[name] = "buildpath.to_s";
    } else if (/_HOME$/.test(name)) {
      // Volta, etc.  Dot-prefixed app home under buildpath.
      const app = binName.toLowerCase();
      env[name] = `(buildpath/".${app}").to_s`;
    } else if (/_DIR$/.test(name)) {
      // Library-style installs (nvm, fnm) belong in libexec.
      env[name] = "libexec.to_s";
    }
  }

  // Some scripts use a bare NO_MODIFY_PATH env (e.g. ante) to skip shell
  // profile edits.  Pick "true" when the default is "false"/"no" and "1"
  // otherwise, so the guard passes regardless of the exact truthiness check.
  if (/\bNO_MODIFY_PATH\b/i.test(text)) {
    const defaultMatch = text.match(
      /\bNO_MODIFY_PATH\s*=\s*["']?\$\{NO_MODIFY_PATH:-([^}]+)\}["']?/,
    );
    const defaultValue = defaultMatch?.[1] || "";
    env.NO_MODIFY_PATH = /^(false|no)$/i.test(defaultValue) ? "true" : "1";
  }

  return {
    args,
    env,
    ensureBinDir,
    valueArgs,
    installScriptRewrite: shouldRewriteForHomebrew(text),
  };
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

function formatEnvValue(v: string): string {
  // Allow raw Ruby expressions for buildpath/version/prefix/libexec references.
  if (/^(?:buildpath|version|prefix|libexec|\(buildpath|ENV\[)/.test(v) || /\.to_s$/.test(v) || v.includes('buildpath/')) {
    return v;
  }
  return rubyString(v);
}

function installScriptRubyFragments(
  flags: InstallScriptFlags,
  shell: "sh" | "bash",
): {
  installEnvLines: string;
  installArgsRuby: string;
  ensureBinDir: boolean;
  scriptShell: "sh" | "bash";
  installScriptRewrite: boolean;
} {
  const envLines = Object.entries(flags.env)
    .map(([k, v]) => `    ENV[${rubyString(k)}] = ${formatEnvValue(v)}\n`)
    .join("");

  const parts: string[] = flags.args.map((a) => `, ${rubyString(a)}`);
  for (const va of flags.valueArgs) {
    parts.push(`, ${rubyString(va.arg)}, ${va.value}`);
  }

  return {
    installEnvLines: envLines,
    installArgsRuby: parts.join(""),
    ensureBinDir: flags.ensureBinDir,
    scriptShell: shell,
    installScriptRewrite: flags.installScriptRewrite || false,
  };
}

/** Resolve a Homebrew-safe version for static install-script URLs. */
export async function resolveInstallScriptVersion(
  url: string,
  options: any = {},
  scriptText?: string,
): Promise<string> {
  if (options.version) return extractVersionFromTag(String(options.version));

  const fromUrl = extractVersionFromUrl(url);
  if (fromUrl) return fromUrl;

  const releaseTag = options.repoInfo?.releaseTag || options.release?.tagName;
  if (releaseTag) return extractVersionFromTag(String(releaseTag));

  // Prefer a version pinned inside the script body (e.g. APP_VERSION="1.2.3").
  if (scriptText) {
    const bodyVersion = scriptText.match(
      /(?:^|[\s;])(?:APP_)?VERSION\s*=\s*["']v?(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.]+)?)["']/im,
    );
    if (bodyVersion?.[1]) return bodyVersion[1];

    const defaultVersion = scriptText.match(
      /(?:^|[\s;])VERSION\s*=\s*["']?\$\{VERSION:-v?(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.]+)?)\}["']?/,
    );
    if (defaultVersion?.[1]) return defaultVersion[1];

    const miseVersion = scriptText.match(
      /version\s*=\s*["']?\$\{[A-Z_]+_VERSION:-v?(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.]+)?)\}["']?/,
    );
    if (miseVersion?.[1]) return miseVersion[1];
  }

  // raw.githubusercontent.com/owner/repo/ref/path -> use ref if version-like, else latest release
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

  // Last resort: try to find any github.com/owner/repo link in the script and
  // use the latest release tag.
  if (scriptText) {
    const gh = scriptText.match(/https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
    if (gh) {
      const owner = gh[1];
      const repo = gh[2].replace(/\.git$/, "");
      try {
        const { getLatestRelease } = await import("../github.ts");
        const release = await getLatestRelease(owner, repo);
        if (release?.tagName) return extractVersionFromTag(release.tagName);
      } catch {
        /* ignore */
      }
    }
  }

  // Homebrew requires a non-nil version; livecheck can still move it later.
  return UNKNOWN_VERSION;
}

export async function collectInstallScriptPayload(
  url: string,
  options: any = {},
): Promise<InstallScriptPayload> {
  const { sha256, buffer } = await downloadAndHash(url);

  const filename = url.split("/").pop().split("?")[0] || "install.sh";
  const baseName = filename.replace(/\.(sh|bash)$/i, "");
  const name = options.name || toFormulaName(baseName);
  const className = toClassName(name);
  const desc = options.desc || `Install ${baseName} via setup script`;
  const repoInfo = options.repoInfo;
  const license = guessLicenseIdentifier(options.license || repoInfo?.license || null);
  const scriptText = buffer && buffer.length < 2_000_000 ? buffer.toString("utf8") : "";
  const version = await resolveInstallScriptVersion(url, options, scriptText);
  let binName = options.binName || name;

  if (!options.binName) {
    const detected = detectBinNameFromInstallScript(scriptText);
    if (detected) binName = detected;
  }

  let flags: InstallScriptFlags =
    options.installFlags ||
    (scriptText
      ? detectInstallScriptFlags(scriptText, binName)
      : { args: [], env: {}, ensureBinDir: true, valueArgs: [], installScriptRewrite: false });

  // Normalize partial option overrides.
  if (!flags.args) flags.args = [];
  if (!flags.env) flags.env = {};
  if (!flags.valueArgs) flags.valueArgs = [];

  // Allow explicit option overrides
  if (options.force === true) flags.env.FORCE = "1";
  if (Array.isArray(options.scriptArgs)) {
    for (const a of options.scriptArgs) {
      if (!flags.args.includes(a)) flags.args.push(a);
    }
  }

  // Pin the installed version to the resolved formula version when the script
  // supports a VERSION environment variable or --version flag.
  if (version !== UNKNOWN_VERSION) {
    if (/\bVERSION\s*=\s*["']?\$\{VERSION:/.test(scriptText) || /\bVERSION\s*=\s*["']?\$\{VERSION-/.test(scriptText)) {
      flags.env.VERSION = version;
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
    installScriptRewrite: rubyBits.installScriptRewrite,
  };
}

export async function generateInstallScript(url: string, options: any = {}) {
  const payload = await collectInstallScriptPayload(url, options);
  return writeRenderedFormula(payload, options.tapPath);
}
