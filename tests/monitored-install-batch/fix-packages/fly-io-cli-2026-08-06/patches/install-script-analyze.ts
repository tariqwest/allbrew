/**
 * Pure analysis of bash install-script bodies (e.g. curl|sh installers).
 * Used to re-route scripts that install into $HOME/.tool, /Applications, or
 * ignore PREFIX to better generators (cask-app / homebrew-formula) and to
 * extract service / bin name hints.
 */

export type InstallScriptMacApp = {
  appName: string;
  artifactUrl: string;
};

export type InstallScriptServiceHint = {
  command: string[];
  keepAlive?: boolean;
};

export type InstallScriptAnalysis = {
  usesPrefix: boolean;
  looksLikeSystemInstaller: boolean;
  /** Installs under $HOME/.something (or similar) rather than PREFIX/Cellar. */
  homeDirInstaller: boolean;
  macApp: InstallScriptMacApp | null;
  service: InstallScriptServiceHint | null;
  suggestedBinName: string | null;
  /** Ordered candidates for core-formula matching (bin names, tokens). */
  coreNameCandidates: string[];
  signals: string[];
};

const APP_NAME_RE = /\b([A-Za-z][A-Za-z0-9._+ -]*\.app)\b/g;
const ARTIFACT_URL_RE =
  /https?:\/\/[^\s"'\\]+?\.(?:zip|dmg|pkg)(?:\?[^\s"'\\$]*)?(?:\$\{[^}]*\})?/gi;
const EXEC_START_RE = /^\s*ExecStart=(.+)$/m;
const SYSTEMD_SERVICE_RE = /systemd|\.service\b|systemctl\b/i;
const SUDO_OR_ROOT_RE = /\bsudo\b|\$SUDO\b|id -u|EUID/i;
const USR_LOCAL_INSTALL_RE =
  /\/usr\/local\/(?:bin|lib|share)|\/opt\/|\/Applications\//i;
const HOME_DOT_DIR_RE =
  /\$\{?HOME\}?\/\.[A-Za-z0-9._+-]+|\$HOME\/\.[A-Za-z0-9._+-]+|~\/\.[A-Za-z0-9._+-]+/i;
const CUSTOM_INSTALL_ENV_RE =
  /\b(?:FLYCTL_INSTALL|INSTALL_DIR|INSTALL_PATH|XDG_DATA_HOME)\b/;

/** Parse systemd ExecStart into argv, dropping $VAR path prefixes. */
function parseExecStart(line: string): string[] | null {
  let rest = String(line || "").trim();
  if (!rest) return null;
  rest = rest.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)+/, "");
  const tokens = rest
    .split(/\s+/)
    .map((t) => t.replace(/^["']|["']$/g, ""))
    .filter(Boolean);
  if (!tokens.length) return null;
  const binTok = tokens[0];
  const bin = binTok.includes("/")
    ? binTok.split("/").filter(Boolean).pop()!
    : binTok;
  if (!bin || bin.startsWith("$") || !/^[A-Za-z0-9._+-]+$/.test(bin)) {
    return null;
  }
  const args = tokens
    .slice(1)
    .filter((a) => a && !a.startsWith("$") && !a.includes("${"));
  return [bin, ...args];
}

/**
 * Extract likely CLI binary basenames from script text
 * (e.g. $bin_dir/flyctl, exe="$bin_dir/flyctl").
 */
function extractBinCandidates(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    let b = String(raw || "").toLowerCase();
    // Drop archive / package suffixes so "flyctl.tar.gz" → "flyctl"
    b = b.replace(
      /\.(?:tar\.gz|tgz|tar\.bz2|tar\.xz|zip|dmg|pkg|exe|sh|bash)$/i,
      "",
    );
    b = b.replace(/\.exe$/i, "");
    if (!b || b.length < 2 || b.length > 40) return;
    if (!/^[a-z][a-z0-9._+-]*$/.test(b)) return;
    // Skip generic shell words
    if (
      /^(bin|tmp|dir|path|install|script|curl|tar|sh|bash|zsh|home|user|local|opt)$/.test(
        b,
      )
    ) {
      return;
    }
    if (seen.has(b)) return;
    seen.add(b);
    found.push(b);
  };

  // $bin_dir/flyctl or ${bin_dir}/flyctl or "$bin_dir/flyctl"
  for (const m of text.matchAll(
    /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?\/([A-Za-z][A-Za-z0-9._+-]+)/g,
  )) {
    push(m[1]);
  }
  // exe=.../flyctl or similar
  for (const m of text.matchAll(
    /(?:exe|binary|bin_path|cmd)\w*\s*=\s*["']?[^"'\n]*\/([A-Za-z][A-Za-z0-9._+-]+)["']?/gi,
  )) {
    push(m[1]);
  }
  // chmod +x .../flyctl
  for (const m of text.matchAll(
    /chmod\s+(?:\+x|-x|[0-7]+)\s+["']?[^"'\n]*\/([A-Za-z][A-Za-z0-9._+-]+)/g,
  )) {
    push(m[1]);
  }

  return found;
}

/** Well-known install script hosts → core formula / bin name. */
function wellKnownCoreName(url?: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const path = u.pathname.toLowerCase();
    if (host === "fly.io" && /install\.sh$/.test(path)) return "flyctl";
    if (host === "ollama.com" && /install\.sh$/.test(path)) return "ollama";
    if (host === "get.docker.com") return "docker";
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Analyze install script source text.
 */
export function analyzeInstallScript(
  scriptText: string,
  opts: { url?: string; name?: string } = {},
): InstallScriptAnalysis {
  const text = String(scriptText || "");
  const signals: string[] = [];

  const usesPrefix =
    /\$\{?PREFIX\}?/.test(text) ||
    /\$\{?DESTDIR\}?/.test(text) ||
    /\bPREFIX=/.test(text);

  if (usesPrefix) signals.push("references-PREFIX");

  const appNames = new Set<string>();
  for (const m of text.matchAll(APP_NAME_RE)) {
    if (m[1]) appNames.add(m[1]);
  }

  const artifactUrls: string[] = [];
  for (const m of text.matchAll(ARTIFACT_URL_RE)) {
    let raw = String(m[0] || "").replace(/[),.;]+$/g, "");
    raw = raw.replace(/\$\{[^}]+\}/g, "").replace(/\$\([^)]+\)/g, "");
    raw = raw.replace(/\?+$/, "");
    if (!/^https?:\/\//i.test(raw)) continue;
    if (!/\.(?:zip|dmg|pkg)$/i.test(raw)) continue;
    artifactUrls.push(raw);
  }

  const macArtifact =
    artifactUrls.find((u) => /darwin|macos|mac\.|osx/i.test(u)) ||
    artifactUrls.find((u) => /\.(?:dmg|zip)$/i.test(u)) ||
    null;

  let macApp: InstallScriptMacApp | null = null;
  if (appNames.size > 0 && macArtifact) {
    const appName = [...appNames][0];
    macApp = { appName, artifactUrl: macArtifact };
    signals.push("macos-app-bundle", `app:${appName}`, `artifact:${macArtifact}`);
  } else if (appNames.size > 0) {
    signals.push("macos-app-bundle-no-url", `app:${[...appNames][0]}`);
  }

  let service: InstallScriptServiceHint | null = null;
  const execMatch = text.match(EXEC_START_RE);
  if (execMatch) {
    const argv = parseExecStart(execMatch[1]);
    if (argv?.length) {
      service = { command: argv, keepAlive: true };
      signals.push(`service:${service.command.join(" ")}`);
    }
  } else if (/\bollama\s+serve\b/.test(text)) {
    service = { command: ["ollama", "serve"], keepAlive: true };
    signals.push("service:ollama serve");
  }

  const homeDirInstaller =
    !usesPrefix &&
    (HOME_DOT_DIR_RE.test(text) || CUSTOM_INSTALL_ENV_RE.test(text));
  if (homeDirInstaller) signals.push("home-dir-installer");

  const looksLikeSystemInstaller =
    !usesPrefix &&
    (Boolean(macApp) ||
      USR_LOCAL_INSTALL_RE.test(text) ||
      (SUDO_OR_ROOT_RE.test(text) && SYSTEMD_SERVICE_RE.test(text)) ||
      homeDirInstaller);

  if (looksLikeSystemInstaller) signals.push("system-installer");

  const binFromScript = extractBinCandidates(text);
  const known = wellKnownCoreName(opts.url);
  if (known) signals.push(`well-known:${known}`);

  const coreNameCandidates: string[] = [];
  const pushCand = (c: string | null | undefined) => {
    const t = String(c || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._+-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!t || coreNameCandidates.includes(t)) return;
    coreNameCandidates.push(t);
  };
  pushCand(known);
  for (const b of binFromScript) pushCand(b);
  // fly symlink companion often appears; prefer flyctl over fly
  if (coreNameCandidates.includes("fly") && !coreNameCandidates.includes("flyctl")) {
    /* keep fly */
  }
  // Prefer flyctl before bare fly when both present
  if (
    coreNameCandidates.includes("flyctl") &&
    coreNameCandidates.includes("fly")
  ) {
    const ordered = [
      "flyctl",
      ...coreNameCandidates.filter((c) => c !== "flyctl"),
    ];
    coreNameCandidates.length = 0;
    for (const c of ordered) pushCand(c);
  }
  pushCand(opts.name);
  if (service?.command?.[0]) pushCand(service.command[0]);
  if (macApp) pushCand(macApp.appName.replace(/\.app$/i, ""));

  const suggestedBinName =
    known ||
    binFromScript.find((b) => b === "flyctl") ||
    binFromScript[0] ||
    (service?.command?.[0] ?? null) ||
    (macApp ? macApp.appName.replace(/\.app$/i, "").toLowerCase() : null) ||
    opts.name ||
    null;

  if (suggestedBinName) signals.push(`bin:${suggestedBinName}`);

  return {
    usesPrefix,
    looksLikeSystemInstaller,
    homeDirInstaller,
    macApp,
    service,
    suggestedBinName: suggestedBinName ? String(suggestedBinName) : null,
    coreNameCandidates,
    signals,
  };
}

/**
 * Fetch install script body for analysis (bounded).
 */
export async function fetchInstallScriptText(
  url: string,
  opts: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxBytes = opts.maxBytes ?? 512_000;
  const response = await fetch(url, {
    headers: { "User-Agent": "allbrew/1.0" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch install script: HTTP ${response.status}`);
  }
  const buf = new Uint8Array(await response.arrayBuffer());
  const slice = buf.byteLength > maxBytes ? buf.subarray(0, maxBytes) : buf;
  return new TextDecoder("utf-8", { fatal: false }).decode(slice);
}
