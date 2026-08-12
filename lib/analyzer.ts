const BREW_INSTALL_RE = /brew\s+install\s+(?:--cask\s+)?([^\s;|&\n]+)/gi;
const BREW_TAP_RE = /brew\s+tap\s+([^\s;|&\n]+)/gi;
const BREW_CASK_RE =
  /brew\s+(?:cask\s+install|install\s+--cask)\s+([^\s;|&\n]+)/gi;

// Optional shell prompt chars: $, #, %, > (docs often show `> pip install foo`)
const SHELL_PROMPT = "(?:[$#%>]\\s*)?";
const NPM_INSTALL_RE =
  new RegExp(`(?:^|[\`\\n])\\s*${SHELL_PROMPT}npm[ \\t]+(?:install|i)[ \\t]+(?:-g[ \\t]+)?([^\\s;|&\\n\`]+)`, "i");
const PNPM_INSTALL_RE =
  new RegExp(`(?:^|[\`\\n])\\s*${SHELL_PROMPT}pnpm[ \\t]+(?:install|add)[ \\t]+(?:-g[ \\t]+)?([^\\s;|&\\n\`]+)`, "i");
const YARN_GLOBAL_ADD_RE =
  new RegExp(`(?:^|[\`\\n])\\s*${SHELL_PROMPT}yarn[ \\t]+global[ \\t]+add[ \\t]+([^\\s;|&\\n\`]+)`, "i");
const BUN_INSTALL_RE =
  new RegExp(`(?:^|[\`\\n])\\s*${SHELL_PROMPT}bun[ \\t]+(?:install|add)[ \\t]+(?:-g[ \\t]+|--global[ \\t]+)?([^\\s;|&\\n\`]+)`, "i");
const NPX_RE =
  new RegExp(`(?:^|[\`\\n])\\s*${SHELL_PROMPT}npx[ \\t]+([^\\s;|&\\n\`]+)`, "i");
const PIP_FLAGS =
  "(?:[ \\t]+-(?:[A-Za-z]|-[\\w-]+)(?:=[^\\s;|&\\n]*)?)*";
const PIP_INSTALL_RE =
  new RegExp(`(?:^|[\`\\n])\\s*${SHELL_PROMPT}pip[3]?[ \\t]+install(?:[ \\t]+-(?:[A-Za-z]|-[\\w-]+)(?:=[^\\s;|&\\n\`]*)?)*[ \\t]+([^\\s;|&\\n\`'-][^\\s;|&\\n\`]*)`, "i");
const PIPX_INSTALL_RE =
  new RegExp(`(?:^|[\`\\n])\\s*${SHELL_PROMPT}pipx[ \\t]+install(?:[ \\t]+-(?:[A-Za-z]|-[\\w-]+)(?:=[^\\s;|&\\n\`]*)?)*[ \\t]+([^\\s;|&\\n\`'-][^\\s;|&\\n\`]*)`, "i");
const UV_TOOL_INSTALL_RE =
  new RegExp(`(?:^|[\`\\n])\\s*${SHELL_PROMPT}uv[ \\t]+(?:tool[ \\t]+install|pip[ \\t]+install)(?:[ \\t]+-(?:[A-Za-z]|-[\\w-]+)(?:=[^\\s;|&\\n\`]*)?)*[ \\t]+([^\\s;|&\\n\`'-][^\\s;|&\\n\`]*)`, "i");
const UVX_RE =
  new RegExp(`(?:^|[\`\\n])\\s*${SHELL_PROMPT}uvx(?:[ \\t]+-(?:[A-Za-z]|-[\\w-]+)(?:=[^\\s;|&\\n\`]*)?)*[ \\t]+([^\\s;|&\\n\`'-][^\\s;|&\\n\`]*)`, "i");
const DENO_INSTALL_RE =
  new RegExp(`(?:^|[\`\\n])\\s*${SHELL_PROMPT}deno[ \\t]+install\\b[^\\n\`]*(?:\\s(?:--name|-n)[ =]([^\\s;|&\\n\`]+)|\\s([\\w./:@-]+))(?:[^\\n\`]*)`, "i");
const SWIFT_RUN_RE =
  new RegExp(`(?:^|[\`\\n])\\s*${SHELL_PROMPT}swift[ \\t]+run(?:[ \\t]+(?:-c|--configuration)[ \\t]+\\w+)?(?:[ \\t]+([^\\s;|&\\n\`]+))?`, "i");
const CARGO_INSTALL_RE =
  new RegExp(`(?:^|[\`\\n])\\s*${SHELL_PROMPT}cargo[ \\t]+install[ \\t]+(?:--locked[ \\t]+|--force[ \\t]+)?(?!--path\\b|--git\\b|--)([a-zA-Z][a-zA-Z0-9_-]*)`, "i");
const GO_INSTALL_RE =
  new RegExp(`(?:^|[\`\\n])\\s*${SHELL_PROMPT}go[ \\t]+install[ \\t]+([\\w./-]+@[\\w.]+)`, "i");
// e.g. `dotnet tool install -g csharprepl` / `dotnet tool install --global Foo.Bar`
const DOTNET_TOOL_INSTALL_RE =
  new RegExp(
    `(?:^|[\`\\n])\\s*${SHELL_PROMPT}dotnet[ \\t]+tool[ \\t]+install(?:[ \\t]+(?:-[a-zA-Z]|--[\\w-]+)(?:=[^\\s;|&\\n\`]*)?)*[ \\t]+([^\\s;|&\\n\`'-][^\\s;|&\\n\`]*)`,
    "i",
  );
// e.g. `gem install license_finder` / `gem install -N foo`
const GEM_INSTALL_RE =
  new RegExp(
    `(?:^|[\`\\n])\\s*${SHELL_PROMPT}gem[ \\t]+install(?:[ \\t]+(?:-[a-zA-Z]|--[\\w-]+)(?:=[^\\s;|&\\n\`]*)?)*[ \\t]+([^\\s;|&\\n\`'-][^\\s;|&\\n\`]*)`,
    "i",
  );

// curl|bash / wget|sh install one-liners and direct .sh/.bash install URLs
const CURL_PIPE_SHELL_RE =
  /(?:curl|wget)\b[^\n`]*?(https?:\/\/[^\s;|&"'`\)\]]+)[^\n`]*?\|[ \t]*(?:sudo[ \t]+)?(?:bash|sh)\b/i;
const SHELL_PROCESS_SUBST_RE =
  /(?:bash|sh)\s+<\(\s*(?:curl|wget)\b[^\n`]*?(https?:\/\/[^\s;|&"'`\)\]]+)/i;
const SHELL_C_CURL_RE =
  /(?:bash|sh)\s+-c\s+["']\s*\$\(\s*(?:curl|wget)\b[^\n`"']*?(https?:\/\/[^\s;|&"'`\)\]]+)/i;
const MARKDOWN_SCRIPT_LINK_RE =
  /\[[^\]]*\]\((https?:\/\/[^\s)]+\.(?:sh|bash)(?:\?[^\s)]*)?)\)/i;
// Require a path segment before .sh/.bash so hostnames like img.shields.io do not match.
const BARE_SCRIPT_URL_RE =
  /(?:^|[`\n(\s])((?:https?:\/\/)[^\s;|&"'`\)\]]+\/[^\s;|&"'`\)\]]+\.(?:sh|bash)(?:\?[^\s;|&"'`\)\]]*)?)/i;
const RELATIVE_INSTALL_SCRIPT_RE =
  /(?:^|[`\n])\s*(?:\$\s*)?(?:bash|sh)\s+(\.?\/?[\w./-]*(?:install|setup)\.(?:sh|bash))\b/i;

const BUILD_PATTERNS = [
  // Prefer local/editable Python installs before loose build-tool matches.
  {
    pattern:
      /\b(?:python[3]?\s+-m\s+pip|pip[3]?)\s+install\s+(?:(?:-[a-zA-Z]|--[\w-]+)(?:\s|=)[^\s]*)*\s*\./i,
    system: "python",
  },
  { pattern: /cmake\s+/i, system: "cmake" },
  { pattern: /\.\/configure/i, system: "autotools" },
  // Require an explicit make target — bare "make " / "Make sure" must not match.
  { pattern: /\bmake\s+(?:install|all|build)\b/i, system: "make" },
  { pattern: /meson\s+/i, system: "meson" },
  { pattern: /\bgo\s+build\b/i, system: "go" },
];

const SERVICE_HINT_RE =
  /\b(?:brew\s+services|launchctl|launchd|launch\s*agent|launch\s*daemon|systemd|(?:as\s+a\s+)?daemon|background\s+process|run\s+in\s+the\s+background|start\s+on\s+login|supervised\s+service)\b/i;
const SERVICE_COMMAND_RE =
  /(?:^|[\n`])\s*(?:\$\s*)?([a-zA-Z0-9._/-]+(?:\s+(?:serve|server|start|daemon|agent|run|--daemon|--service)\b[^\n`]*)?)/gm;
const LOCAL_ENDPOINT_RE =
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/[\w./~:%?#[\]@!$&'()*+,;=-]*)?/gi;
const WEB_SERVICE_CONTEXT_RE =
  /\b(?:api|dashboard|web\s*ui|ui|server|serve|gateway|proxy|endpoint|base\s+url|listens?|listening|available\s+at|runs?\s+at|open\s+in\s+(?:a\s+)?browser)\b/i;
const NON_RUN_COMMAND_RE =
  /^(?:brew|launchctl|sudo|systemctl|make|curl|wget|git|docker|podman|export|cp|mkdir|cd|echo|cat|bash|sh|zsh|fish|pwsh|powershell|cmd|swift|npm|pnpm|yarn|bun|deno|cargo|go|python[3]?|pip[3]?|uv|uvx)\b/i;
const INSTALL_COMMAND_RE =
  /^(?:(?:npm|pnpm|yarn|bun)[ \t]+(?:install|i|add)\b|yarn[ \t]+global[ \t]+add\b|(?:pip|pip3|pipx)[ \t]+install\b|uv[ \t]+(?:tool[ \t]+install|pip[ \t]+install)\b|uvx\b|cargo[ \t]+install\b|go[ \t]+install\b|deno[ \t]+install\b|dotnet[ \t]+tool[ \t]+install\b|swift[ \t]+(?:run|build|test|package)\b)/i;
// Language-toolchain "run" is not a supervised daemon (swift run, npm run, cargo run, …).
const LANGUAGE_RUNNER_RE =
  /^(?:swift|npm|pnpm|yarn|bun|deno|cargo|go|dotnet|python[3]?|pip[3]?|uv|uvx)\s+run\b/i;
const STATUS_LINE_RE =
  /^(?:api|dashboard|endpoint|listening|server|ui|web\s*ui)\s+(?:at|on|is|available|running)\b/i;

export function detectBrewInstall(readmeText, preferredPackageName = "") {
  if (!readmeText) return null;

  const commands = [];
  let match;

  const brewInstallRe = /brew\s+install\s+(?:--cask\s+)?([^\s;|&\n`]+)/gi;
  while ((match = brewInstallRe.exec(readmeText)) !== null) {
    const isCask = /--cask/.test(match[0]);
    commands.push({ command: match[0].trim(), package: match[1], isCask });
  }

  const brewCaskRe =
    /brew\s+(?:cask\s+install|install\s+--cask)\s+([^\s;|&\n`]+)/gi;
  while ((match = brewCaskRe.exec(readmeText)) !== null) {
    const cmd = match[0].trim();
    if (commands.some((c) => c.command === cmd)) continue;
    commands.push({
      command: cmd,
      package: match[1],
      isCask: true,
    });
  }

  const taps = [];
  const brewTapRe = /brew\s+tap\s+([^\s;|&\n`]+)/gi;
  while ((match = brewTapRe.exec(readmeText)) !== null) {
    taps.push(match[1]);
  }

  if (commands.length === 0) return null;

  const preferred = String(preferredPackageName || "").trim().toLowerCase();
  const preferredLast = preferred.split("/").pop();
  const primary =
    (preferred &&
      commands.find((c) => {
        const pkg = String(c.package || "").toLowerCase();
        const last = pkg.split("/").pop();
        return pkg === preferred || last === preferred || last === preferredLast;
      })) ||
    commands[0];

  // When the caller has a preferred package and the only brew hits are unrelated
  // deps (e.g. `brew install tmux` in testing docs), do not claim the app is on Homebrew.
  if (preferred) {
    const pkg = String(primary.package || "").toLowerCase();
    const last = pkg.split("/").pop();
    const matches =
      pkg === preferred || last === preferred || last === preferredLast;
    if (!matches) return null;
  }

  return {
    installCommand:
      taps.length > 0
        ? `brew tap ${taps[0]} && ${primary.command}`
        : primary.command,
    package: primary.package,
    isCask: primary.isCask || false,
    tap: taps[0] || null,
    allCommands: commands,
  };
}

export type InstallMethodHint = {
  method: string;
  package?: string | null;
  system?: string;
  url?: string;
  script?: string;
};

export function detectInstallMethod(
  readmeText,
  preferredPackageName = "",
): InstallMethodHint | null {
  if (!readmeText) return null;

  let match;

  const npmPackage = pickPreferredNpmPackage(readmeText, preferredPackageName);
  if (npmPackage) return { method: "npm", package: npmPackage };

  const pipHint = pickPreferredPipPackage(readmeText, preferredPackageName);
  if (pipHint) return pipHint;

  match = readmeText.match(CARGO_INSTALL_RE);
  if (match) return { method: "cargo", package: match[1] };

  match = readmeText.match(GO_INSTALL_RE);
  if (match) {
    // go install path@version → strip version for module identity
    // (e.g. github.com/ariasmn/ugm@latest → github.com/ariasmn/ugm)
    const goMod = String(match[1] || "").replace(/@[\w.+\-]+$/, "");
    return { method: "go", package: goMod || match[1] };
  }

  match = readmeText.match(DOTNET_TOOL_INSTALL_RE);
  if (match) {
    const pkg = String(match[1] || "").trim();
    if (pkg) return { method: "dotnet", package: pkg };
  }

  const gemHint = pickPreferredGemPackage(readmeText, preferredPackageName);
  if (gemHint) return gemHint;

  match = readmeText.match(DENO_INSTALL_RE);
  if (match)
    return {
      method: "deno",
      package: match[1] || packageNameFromSpecifier(match[2]),
    };

  match = readmeText.match(SWIFT_RUN_RE);
  if (match) return { method: "swift", package: match[1] || null };

  const script = detectScriptInstall(readmeText);
  if (script) return script;

  for (const { pattern, system } of BUILD_PATTERNS) {
    if (pattern.test(readmeText)) {
      return { method: "build", system };
    }
  }

  return null;
}

/**
 * Detect bash/curl install-script instructions in README text.
 * Returns absolute script URL when present, or a relative script path
 * (e.g. ./install.sh) for the caller to resolve against a GitHub repo.
 */
export function detectScriptInstall(readmeText): InstallMethodHint | null {
  if (!readmeText) return null;

  let match = readmeText.match(CURL_PIPE_SHELL_RE);
  if (match?.[1]) {
    // curl|bash may use hosts without .sh (e.g. https://get.docker.com)
    const url = cleanScriptUrl(match[1], { requireScriptExt: false });
    if (url) return { method: "script", url };
  }

  match = readmeText.match(SHELL_PROCESS_SUBST_RE);
  if (match?.[1]) {
    const url = cleanScriptUrl(match[1], { requireScriptExt: false });
    if (url) return { method: "script", url };
  }

  match = readmeText.match(SHELL_C_CURL_RE);
  if (match?.[1]) {
    const url = cleanScriptUrl(match[1], { requireScriptExt: false });
    if (url) return { method: "script", url };
  }

  match = readmeText.match(MARKDOWN_SCRIPT_LINK_RE);
  if (match?.[1]) {
    const url = cleanScriptUrl(match[1], { requireScriptExt: true });
    if (url) return { method: "script", url };
  }

  match = readmeText.match(BARE_SCRIPT_URL_RE);
  if (match?.[1]) {
    const url = cleanScriptUrl(match[1], { requireScriptExt: true });
    if (url) return { method: "script", url };
  }

  match = readmeText.match(RELATIVE_INSTALL_SCRIPT_RE);
  if (match?.[1]) {
    const script = match[1].replace(/^\.\//, "");
    if (script) return { method: "script", script };
  }

  return null;
}

const BADGE_OR_STATIC_HOST_RE =
  /(?:^|\.)(?:shields\.io|badge(?:s)?\.[a-z0-9.-]+|img\.shields\.io)$/i;

function cleanScriptUrl(raw, opts: { requireScriptExt?: boolean } = {}) {
  if (!raw) return null;
  const requireScriptExt = opts.requireScriptExt !== false;
  let url = String(raw).trim();
  // Strip common trailing punctuation from markdown/prose
  url = url.replace(/[),.;]+$/g, "");
  // Drop shell-quoting leftovers
  url = url.replace(/^['"]|['"]$/g, "");
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const parsed = new URL(url);
    if (BADGE_OR_STATIC_HOST_RE.test(parsed.hostname)) return null;
    // Bare/markdown matches must be real script paths (blocks img.shields.io false positives)
    if (requireScriptExt && !/\.(?:sh|bash)$/i.test(parsed.pathname)) return null;
  } catch {
    return null;
  }
  return url;
}

export function detectServiceConfig(readmeText, packageName = "") {
  if (!readmeText) return null;

  const brewServices = readmeText.match(
    /brew\s+services\s+start\s+([^\s;|&\n`]+)/i,
  );
  if (brewServices) {
    return {
      command: packageName || brewServices[1],
      keepAlive: true,
      confidence: "high",
      reason: "README documents brew services",
    };
  }

  const localWebService = detectLocalWebService(readmeText, packageName);
  if (localWebService) return localWebService;

  const portBoundService = detectPortBoundPackageService(readmeText, packageName);
  if (portBoundService) return portBoundService;

  if (!SERVICE_HINT_RE.test(readmeText)) return null;

  const launchctl = readmeText.match(
    /launchctl\s+(?:load|bootstrap|start)\b[^\n`]*/i,
  );
  if (launchctl) {
    return {
      command: packageName,
      keepAlive: true,
      confidence: "medium",
      reason: "README documents launchctl/launchd usage",
    };
  }

  const commands = [];
  let match;
  SERVICE_COMMAND_RE.lastIndex = 0;
  while ((match = SERVICE_COMMAND_RE.exec(readmeText)) !== null) {
    const command = cleanCommand(match[1]);
    if (!isRunnableCommand(command)) continue;
    if (!isServiceLikeCommand(command, packageName)) continue;
    commands.push(command);
  }

  const preferred = preferPackageCommand(commands, packageName) || commands[0];
  if (!preferred) return null;

  return {
    command: preferred,
    keepAlive: true,
    // Optional `pkg serve`/`server` stays low so non-interactive runs skip it;
    // brew services / launchctl paths above remain high/medium.
    confidence: isOptionalDevServeCommand(preferred, packageName)
      ? "low"
      : "medium",
    reason: "README contains service/daemon wording",
  };
}

/**
 * File/path-driven CLIs (e.g. `reveal-md slides.md`, `tool dir/`) often document
 * optional `--port` and open a browser, but they are not brew-services daemons:
 * the user supplies content per invocation and the process is not an always-on service.
 */
function isFileArgDrivenPackageCli(readmeText, packageName) {
  if (!packageName || !readmeText) return false;

  const pkg = escapeRegExp(packageName);
  const lineRe = new RegExp(
    `(?:^|[\\n\\\`])\\s*(?:\\$\\s*)?(${pkg})((?:[ \\t]+[^\\n\\\`]+)?)`,
    "gim",
  );
  let total = 0;
  let withPathArg = 0;
  let match;
  while ((match = lineRe.exec(readmeText)) !== null) {
    const rest = String(match[2] || "").trim();
    // Skip install lines and env-prefixed non-invocations elsewhere.
    if (/^(?:install|i|add)\b/i.test(rest)) continue;
    total += 1;
    if (!rest) continue;
    const tokens = rest.split(/\s+/).filter(Boolean);
    const positional = tokens.filter(
      (t) =>
        !t.startsWith("-") &&
        !/^(?:PORT=\d+|https?:\/\/)/i.test(t) &&
        !/[=]/.test(t) &&
        // Port numbers / host bind targets are not file paths.
        !/^\d+$/.test(t) &&
        !/^(?:0\.0\.0\.0|127\.0\.0\.1|localhost|\[::1\])$/i.test(t),
    );
    if (
      positional.some(
        (t) =>
          // Relative/absolute paths and filenames (slides.md, dir/, ./foo)
          /[\/]/.test(t) ||
          /^\.{1,2}(?:\/|$)/.test(t) ||
          /\.(?:md|markdown|html?|pdf|txt|adoc|rst|tex|json|ya?ml|toml)$/i.test(
            t,
          ),
      )
    ) {
      withPathArg += 1;
    }
  }

  if (total === 0) return false;
  // Majority of documented invocations take a path/file positional.
  if (total === 1) return withPathArg === 1;
  return withPathArg / total >= 0.5;
}

/**
 * Long-running package binaries documented with PORT= / --port / --host without
 * an explicit localhost URL (e.g. LiteLLM proxies: `PORT=8080 acp-router`).
 */
function detectPortBoundPackageService(readmeText, packageName) {
  if (!packageName || !readmeText) return null;

  // File-arg CLIs documenting optional `--port` are not supervised daemons.
  if (isFileArgDrivenPackageCli(readmeText, packageName)) return null;

  const hasPortBinding =
    /\bPORT\s*=\s*\d+/i.test(readmeText) ||
    /(?:^|[\s`])(?:--port|--host)(?:\s+|=)\S+/im.test(readmeText) ||
    /\blistens?\b/i.test(readmeText);
  if (!hasPortBinding) return null;

  const hasProxyContext =
    WEB_SERVICE_CONTEXT_RE.test(readmeText) ||
    /\b(?:proxy|gateway|openai-compatible|litellm|uvicorn|gunicorn|asgi|wsgi)\b/i.test(
      readmeText,
    );
  if (!hasProxyContext) return null;

  // Require the package binary to appear as a documented run command — never invent it.
  const command = findPackageRunCommand(readmeText, packageName);
  if (!command) return null;

  const parts = String(command).split(/\s+/).filter(Boolean);
  const executable = parts[0]?.split("/").pop();
  if (executable !== packageName) return null;

  // Prefer the bare binary when flags are only port/host overrides.
  const bareOrPortFlags =
    parts.length === 1 ||
    parts
      .slice(1)
      .every((t) =>
        /^(?:--port|--host|=?\d+|0\.0\.0\.0|localhost|127\.0\.0\.1)$/i.test(t),
      );
  const serviceCommand = bareOrPortFlags ? packageName : command;

  return {
    command: serviceCommand,
    keepAlive: true,
    confidence: "high",
    reason:
      "README documents a port-bound long-running package process (PORT/--port/--host)",
  };
}

function detectLocalWebService(readmeText, packageName) {
  LOCAL_ENDPOINT_RE.lastIndex = 0;
  const endpoints = [...readmeText.matchAll(LOCAL_ENDPOINT_RE)];
  if (endpoints.length === 0) return null;

  // File-driven preview CLIs (open browser for a slides file) are not services.
  if (packageName && isFileArgDrivenPackageCli(readmeText, packageName)) {
    return null;
  }

  const hasWebServiceContext = endpoints.some((endpoint) => {
    const index = endpoint.index || 0;
    const nearby = readmeText.slice(Math.max(0, index - 180), index + 220);
    return WEB_SERVICE_CONTEXT_RE.test(nearby);
  });

  if (!hasWebServiceContext) return null;

  const near =
    findCommandNearEndpoint(readmeText, endpoints[0].index || 0, packageName);
  const whole = findPackageRunCommand(readmeText, packageName);
  // Prefer the better supervised entrypoint when the README documents both an
  // interactive webui launcher near the URL and a gateway/daemon elsewhere.
  let command =
    preferPackageCommand(
      [near, whole].filter(Boolean),
      packageName,
    ) ||
    near ||
    whole;

  // Do not invent `packageName` alone from a localhost URL — that over-fires on
  // CLI tools with optional `serve` docs. Require a real runnable command.
  if (!command) return null;

  const parts = command.split(/\s+/).filter(Boolean);
  const executable = parts[0].split("/").pop();
  // When a package name is known, the service entrypoint must be that package
  // (or a path ending in it). Avoid picking fence languages / prose near URLs.
  if (packageName && executable !== packageName) return null;
  const barePackageCommand =
    parts.length === 1 && executable === packageName;
  const optionalServe = isOptionalDevServeCommand(command, packageName);

  return {
    command,
    keepAlive: true,
    // High only when the binary itself is the long-running process (e.g. maildev).
    // Optional `pkg serve` is low so non-interactive installs skip the service block.
    confidence: barePackageCommand ? "high" : optionalServe ? "low" : "medium",
    reason:
      "README shows a local web/API endpoint started by the package command",
    endpoints: endpoints.map((endpoint) => cleanEndpoint(endpoint[0])),
  };
}

/**
 * Optional short-lived/dev bridges that should stay low-confidence so
 * non-interactive installs skip a service block.
 *
 * `pkg serve` is commonly an MCP/stdio or one-off bridge (e.g. gitnexus).
 * `pkg server` / `daemon` / `gateway` are treated as real supervised entrypoints
 * (e.g. omnigent server + local web UI) unless they are clearly one-shot.
 */
function isOptionalDevServeCommand(command, packageName) {
  if (!command || !packageName) return false;
  const trimmed = String(command).trim();
  // Explicit background/daemon flags mean a long-running process even on "serve".
  if (/(?:^|\s)(?:--daemon|--service|--background)(?:\s|$)/i.test(trimmed)) {
    return false;
  }
  const re = new RegExp(
    `^${escapeRegExp(packageName)}\\s+serve(?:\\s|$)`,
    "i",
  );
  return re.test(trimmed);
}

function findCommandNearEndpoint(readmeText, endpointIndex, packageName) {
  const beforeEndpoint = readmeText.slice(0, endpointIndex);
  const afterEndpoint = readmeText.slice(
    endpointIndex,
    Math.min(readmeText.length, endpointIndex + 400),
  );
  const fencedBlocks = [
    ...beforeEndpoint.matchAll(/```[^\n`]*\n([\s\S]*?)```/g),
  ];
  const nearestBlock = fencedBlocks.at(-1)?.[1];
  if (nearestBlock) {
    const command = findRunnableCommandInText(nearestBlock, packageName);
    if (command) return command;
  }

  const nearbyLines = [
    ...beforeEndpoint.split(/\r?\n/).slice(-12),
    ...afterEndpoint.split(/\r?\n/).slice(0, 12),
  ].join("\n");
  return findRunnableCommandInText(nearbyLines, packageName);
}

function findPackageRunCommand(readmeText, packageName) {
  if (!packageName) return null;

  const escapedName = escapeRegExp(packageName);
  const pipNameSuffix = "(?:@[^\\s;|&\\n\\[]+)?(?:\\[[^\\]]*\\])?";
  const installThenRunPatterns = [
    `(?:npm|pnpm|bun)[ \\t]+(?:install|add|i)[ \\t]+(?:-g[ \\t]+|--global[ \\t]+)?${escapedName}`,
    `yarn[ \\t]+global[ \\t]+add[ \\t]+${escapedName}`,
    `(?:pip|pip3|pipx)[ \\t]+install${PIP_FLAGS}[ \\t]+${escapedName}${pipNameSuffix}`,
    `uv[ \\t]+(?:tool[ \\t]+install|pip[ \\t]+install)${PIP_FLAGS}[ \\t]+${escapedName}${pipNameSuffix}`,
    `uvx${PIP_FLAGS}[ \\t]+${escapedName}${pipNameSuffix}`,
    `cargo[ \\t]+install[ \\t]+(?:--locked[ \\t]+|--force[ \\t]+)?${escapedName}`,
    `deno[ \\t]+install\\b[^\\n]*(?:--name|-n)[ =]${escapedName}`,
    `swift[ \\t]+package\\b[^\\n]*\\binstall\\b[^\\n]*${escapedName}`,
  ];

  // Presence of an install-then-run pattern is a strong signal the package CLI is
  // the primary entrypoint, but the first post-install command may be an
  // interactive webui launcher. Rank all package commands in the README.
  for (const pattern of installThenRunPatterns) {
    const installThenRun = new RegExp(
      `${pattern}[\\s\\S]{0,500}?(?:^|\\n)\\s*(?:\\$\\s*)?(${escapedName}(?:[ \\t]+[^\\n]+)?)`,
      "im",
    );
    if (installThenRun.test(readmeText)) {
      return findRunnableCommandInText(readmeText, packageName);
    }
  }

  return findRunnableCommandInText(readmeText, packageName);
}

function findRunnableCommandInText(text, packageName) {
  const commands = text
    .split(/\r?\n/)
    .map(cleanCommand)
    .filter(isRunnableCommand);

  // Also accept package subcommands that are service-like even when the generic
  // SERVICE_COMMAND_RE verbs are absent (e.g. `nanobot gateway`, `foo webui`).
  const packageSubcommands = [];
  if (packageName) {
    const pkg = String(packageName);
    for (const rawLine of String(text || "").split(/\r?\n/)) {
      const line = cleanCommand(rawLine);
      if (!line) continue;
      const parts = line.split(/\s+/).filter(Boolean);
      if (parts.length < 2) continue;
      const executable = parts[0].split("/").pop();
      if (executable !== pkg) continue;
      // Keep first two tokens as the candidate service entrypoint.
      const command = `${parts[0]} ${parts[1]}`;
      if (!isRunnableCommand(command) && !isPackageServiceSubcommand(command, pkg))
        continue;
      packageSubcommands.push(command);
    }
  }

  const merged = [...commands, ...packageSubcommands];
  const unique = [];
  const seen = new Set();
  for (const command of merged) {
    if (seen.has(command)) continue;
    seen.add(command);
    unique.push(command);
  }

  const preferred = preferPackageCommand(unique, packageName);
  if (preferred) return preferred;
  // Never fall back to an arbitrary nearby line (README prose like "RAM.").
  return (
    unique.find((command) => isServiceLikeCommand(command, packageName)) || null
  );
}

function isPackageServiceSubcommand(command, packageName) {
  if (!command || !packageName) return false;
  const re = new RegExp(
    `^${escapeRegExp(packageName)}\\s+(gateway|webui|serve|server|start|daemon|agent)(?:\\s|$)`,
    "i",
  );
  return re.test(String(command).trim());
}

function preferPackageCommand(commands, packageName) {
  if (!commands?.length) return null;

  const packageCommands = packageName
    ? commands.filter((command) => {
        const executable = command.split(/\s+/)[0].split("/").pop();
        return executable === packageName;
      })
    : commands.slice();

  if (packageCommands.length > 0) {
    return pickBestServiceCommand(packageCommands) || packageCommands[0] || null;
  }

  // Without a package-aligned executable, only accept clearly service-like argv.
  const serviceLike = commands.filter((command) =>
    isServiceLikeCommand(command, packageName),
  );
  if (serviceLike.length === 0) return null;
  return pickBestServiceCommand(serviceLike) || serviceLike[0] || null;
}

/** Prefer supervised daemon entrypoints over interactive webui launchers. */
function pickBestServiceCommand(commands) {
  if (!commands?.length) return null;
  const scored = commands.map((command, index) => ({
    command,
    index,
    score: scoreServiceCommand(command),
  }));
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0]?.command || null;
}

function scoreServiceCommand(command) {
  const c = String(command || "").trim().toLowerCase();
  if (!c) return -100;
  let score = 0;
  if (/\bgateway\b/.test(c)) score += 50;
  if (/\b(?:serve|server|daemon|agent)\b/.test(c)) score += 30;
  if (/\bstart\b/.test(c)) score += 20;
  if (/\b(?:--daemon|--service|--background)\b/.test(c)) score += 25;
  if (/\bwebui\b/.test(c) || /\bweb\s*ui\b/.test(c)) score -= 40;
  if (/\bopen\b/.test(c) && /\bbrowser\b/.test(c)) score -= 30;
  // Prefer fewer tokens when scores tie elsewhere (handled by sort stability via index)
  score -= Math.min(c.split(/\s+/).length, 8);
  return score;
}

function pickPreferredNpmPackage(readmeText, preferredPackageName = "") {
  const patterns = [
    NPM_INSTALL_RE,
    PNPM_INSTALL_RE,
    YARN_GLOBAL_ADD_RE,
    BUN_INSTALL_RE,
    NPX_RE,
  ];
  const candidates = [];
  for (const pattern of patterns) {
    const globalRe = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    let match;
    while ((match = globalRe.exec(readmeText)) !== null) {
      const pkg = cleanNpmPackageSpec(match[1]);
      if (!pkg) continue;
      candidates.push({
        package: pkg,
        raw: match[0],
        index: match.index,
        globalInstall: /(?:^|\s)(?:-g|--global|global\s+add)(?:\s|$)/i.test(match[0]),
      });
    }
  }
  if (candidates.length === 0) return null;

  const preferred = String(preferredPackageName || "").trim();
  if (preferred) {
    const preferredLower = preferred.toLowerCase();
    const preferredLast = preferredLower.split("/").pop();
    const matchPreferred = candidates.find((c) => {
      const pkg = c.package.toLowerCase();
      const last = pkg.split("/").pop();
      return (
        pkg === preferredLower ||
        pkg === preferredLast ||
        last === preferredLower ||
        last === preferredLast
      );
    });
    // Prefer matching the app/package name. Do not fall back to an unrelated
    // global npm/pnpm install (e.g. `npm install -g pnpm` in a Python monorepo
    // README) when the preferred package only appears via pip/uv later.
    if (matchPreferred) return matchPreferred.package;
    return null;
  }

  const globalHit = candidates.find((c) => c.globalInstall);
  if (globalHit) return globalHit.package;
  return candidates[0].package;
}

/**
 * Collect `gem install` specs from README and pick the app package.
 * When preferredPackageName is set (repo name / --name), prefer that over
 * toolchain deps (e.g. Smashing README documents `gem install bundler` then
 * `gem install smashing`). Prefer preferred match; do not fall back to an
 * unrelated gem when preferred is set — later gemspec detection can win.
 */
function pickPreferredGemPackage(readmeText, preferredPackageName = "") {
  if (!readmeText) return null;

  const candidates = [];
  const globalRe = new RegExp(
    GEM_INSTALL_RE.source,
    GEM_INSTALL_RE.flags.includes("g")
      ? GEM_INSTALL_RE.flags
      : `${GEM_INSTALL_RE.flags}g`,
  );
  let match;
  while ((match = globalRe.exec(readmeText)) !== null) {
    const pkg = cleanGemPackageSpec(match[1]);
    if (!pkg) continue;
    candidates.push({
      package: pkg,
      raw: match[0],
      index: match.index,
    });
  }
  if (candidates.length === 0) return null;

  const preferred = String(preferredPackageName || "").trim();
  if (preferred) {
    const preferredLower = preferred.toLowerCase();
    const preferredLast = preferredLower.split("/").pop();
    const matchPreferred = candidates.find((c) => {
      const pkg = c.package.toLowerCase();
      const last = pkg.split("/").pop();
      return (
        pkg === preferredLower ||
        pkg === preferredLast ||
        last === preferredLower ||
        last === preferredLast
      );
    });
    if (matchPreferred) {
      return { method: "gem", package: matchPreferred.package };
    }
    // Preferred name set but no gem hit for it — let gemspec / other methods try.
    return null;
  }

  // No preferred: skip well-known Ruby toolchain gems when a real app gem exists.
  const app = candidates.find((c) => !GEM_TOOLCHAIN_PACKAGES.has(c.package.toLowerCase()));
  if (app) return { method: "gem", package: app.package };
  return { method: "gem", package: candidates[0].package };
}

/** Strip version pins / trailing punctuation from a `gem install` argument. */
function cleanGemPackageSpec(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  // Drop trailing markdown/code fences or sentence punctuation
  s = s.replace(/[`'")\],.;:]+$/g, "");
  // `gem install foo:1.2` / `foo -v 1.2` handled by regex already; strip :version
  s = s.replace(/:[\w.+-]+$/, "");
  // Reject local paths and empty
  if (!s || s.startsWith(".") || s.startsWith("/") || s.startsWith("~")) {
    return null;
  }
  // Gem names are [a-z0-9_-] with optional namespace separators rarely used
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s)) return null;
  return s;
}

/** Ruby toolchain / dep gems often listed before the app in install docs. */
const GEM_TOOLCHAIN_PACKAGES = new Set([
  "bundler",
  "rake",
  "rubygems-update",
  "gem-release",
  "rdoc",
  "minitest",
  "rspec",
  "rake-compiler",
]);

/**
 * Collect pip/pipx/uv/uvx install specs from README and pick the app package.
 * When preferredPackageName is set (repo name / --name), prefer that over optional
 * deps (e.g. visdom README documents `pip install plotly` for an optional feature).
 * Shell prompts (`>`, `%`, `$`, `#`) are accepted before the install command.
 */
function pickPreferredPipPackage(readmeText, preferredPackageName = "") {
  const patterns = [
    PIP_INSTALL_RE,
    PIPX_INSTALL_RE,
    UV_TOOL_INSTALL_RE,
    UVX_RE,
  ];
  const candidates = [];
  for (const pattern of patterns) {
    const globalRe = new RegExp(
      pattern.source,
      pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
    );
    let match;
    while ((match = globalRe.exec(readmeText)) !== null) {
      const rawSpec = match[1];
      if (isLocalPipInstallTarget(rawSpec)) {
        candidates.push({
          package: null,
          localBuild: true,
          raw: match[0],
          index: match.index,
        });
        continue;
      }
      const pkg = cleanPipPackageSpec(rawSpec);
      if (!pkg) continue;
      candidates.push({
        package: pkg,
        localBuild: false,
        raw: match[0],
        index: match.index,
      });
    }
  }
  if (candidates.length === 0) return null;

  const preferred = String(preferredPackageName || "").trim();
  if (preferred) {
    const preferredLower = preferred.toLowerCase();
    const preferredLast = preferredLower.split("/").pop();
    const matchPreferred = candidates.find((c) => {
      if (!c.package) return false;
      const pkg = c.package.toLowerCase();
      const last = pkg.split("/").pop();
      return (
        pkg === preferredLower ||
        pkg === preferredLast ||
        last === preferredLower ||
        last === preferredLast
      );
    });
    // Prefer matching the app/package name. Do not fall back to an unrelated
    // optional dep (e.g. `pip install plotly` in a visdom README) when the
    // preferred package only appears behind a shell prompt or later in docs.
    if (matchPreferred) {
      return { method: "pip", package: matchPreferred.package };
    }
    // Preferred name set but no pip hit for it — let later methods try.
    // Local editable installs still count as python source build.
    const local = candidates.find((c) => c.localBuild);
    if (local) return { method: "build", system: "python" };
    return null;
  }

  const local = candidates.find((c) => c.localBuild);
  if (local) return { method: "build", system: "python" };
  const first = candidates.find((c) => c.package);
  if (first) return { method: "pip", package: first.package };
  return null;
}

/** Bare English headings like `Run:` must not become service commands. */
function isServiceLikeCommand(command, packageName = "") {
  if (!command) return false;
  const parts = command.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return false;

  // Bare package/binary names are handled by brew-services / launchctl / local-web paths.
  // Matching them here over-fires when README only says "service" in prose and lists the CLI.
  if (parts.length === 1) return false;

  return /\b(?:serve|server|start|daemon|agent|run|gateway|webui|--daemon|--service|--background)\b/i.test(
    command,
  );
}

function isRunnableCommand(command) {
  if (!command) return false;
  if (NON_RUN_COMMAND_RE.test(command)) return false;
  if (INSTALL_COMMAND_RE.test(command)) return false;
  if (LANGUAGE_RUNNER_RE.test(command)) return false;
  if (STATUS_LINE_RE.test(command)) return false;
  if (/^(?:#|\/\/)/.test(command)) return false;
  if (/https?:\/\//i.test(command)) return false;
// Continued shell lines that start with flags are not complete argv.
  if (/^-/.test(command.trim())) return false;
  // Status labels near URLs ("OpenAI-compatible endpoint:") are not argv.
  if (/:$/.test(command.trim())) return false;
  // Markdown list/link leftovers are never argv (e.g. "- [Local server](docs/x.md)").
  if (/[[\]]/.test(command) || /\]\(/.test(command)) return false;
  if (/^[-*+]\s+/.test(command) || command.startsWith("- ")) return false;
  // Build-tree paths are not Homebrew service entrypoints.
  if (/(?:^|[\s/])\.build\//.test(command) || command.startsWith("./")) return false;
  // Single ALLCAPS token / sentence fragment leftovers ("RAM.")
  if (/^[A-Z]{2,8}\.?$/.test(command.trim())) return false;
  // Help/version probes are not long-running services
  if (/(?:^|\s)(--help|-h|--version|-V)(?:\s|$)/.test(command)) return false;
  // Reject prose sentences mistaken for commands (capitalized English openers).
  if (
    /^(?:The|This|These|Those|A|An|When|Where|What|How|If|For|With|After|Before|Once|Then|Also|Note|Please|Run|Start|Stop|Install|Usage|Usage:|Run:|Start:|Local)\b/.test(
      command,
    )
  ) {
    return false;
  }
// Bare English verbs used as markdown headings ("Run:", "Start") are not argv.
  if (/^(?:run|start|stop|serve|server|daemon|agent)$/i.test(command.trim())) {
    return false;
  }
  // Markdown fence languages (```bash) must not become argv after stripping ticks.
  if (/^(?:bash|sh|zsh|fish|shell|console|shellsession|powershell|pwsh|cmd|terminal)$/i.test(command.trim())) {
    return false;
  }
  // Long comma-heavy lines are almost always prose, not argv.
  if ((command.match(/,/g) || []).length >= 2) return false;
  const tokens = command.split(/\s+/).filter(Boolean);
  if (tokens.length > 12) return false;
  // Multi-word lines without flags/paths are almost always English prose, not argv
  // (e.g. "loopback server accepts function-tool declarations and returns").
  if (tokens.length >= 4) {
    const hasFlag = tokens.some((t) => t.startsWith("-"));
    const hasPath = tokens[0].includes("/");
    if (!hasFlag && !hasPath) return false;
  }
  if (
    tokens.length >= 3 &&
    /\b(?:accepts|returns|provides|includes|supports|allows|using|about|declarations?)\b/i.test(
      command,
    )
  ) {
    return false;
  }
  return /^[a-zA-Z0-9._/-]+(?:\s+[^\n]+)?$/.test(command);
}

function cleanEndpoint(endpoint) {
  return String(endpoint).replace(/[.,;:!?]+$/, "");
}

function cleanCommand(line) {
  let cleaned = String(line || "")
    .replace(/^\s*(?:\$|>)\s*/, "")
    // Markdown unordered/ordered list markers
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "")
    // Markdown links: keep visible label text only when it looks like code; else drop
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+#.*$/, "")
    .replace(/\s+\/\/.*$/, "")
    // Line-continuation backslashes from multi-line shell examples
    .replace(/\s*\\$/, "")
    .trim();
  // Drop pure markdown emphasis leftovers
  cleaned = cleaned.replace(/^[`*]+|[`*]+$/g, "").trim();
  // Strip leading ENV=value assignments: PORT=8080 acp-router → acp-router
  while (/^[A-Za-z_][A-Za-z0-9_]*=\S+\s+/.test(cleaned)) {
    cleaned = cleaned.replace(/^[A-Za-z_][A-Za-z0-9_]*=\S+\s+/, "").trim();
  }
  // Sentence-ending punctuation is not part of argv
  cleaned = cleaned.replace(/[.;:!?]+$/g, "").trim();
  return cleaned;
}

function packageNameFromSpecifier(specifier) {
  if (!specifier) return null;

  const cleaned = specifier
    .replace(/^jsr:/, "")
    .replace(/^npm:/, "")
    .replace(/@[^/@]+$/, "")
    .replace(/\?.*$/, "")
    .replace(/#.*$/, "");

  return cleaned.split("/").filter(Boolean).at(-1) || null;
}

function cleanNpmPackageSpec(specifier) {
  if (!specifier) return null;

  let cleaned = String(specifier)
    .trim()
    .replace(/^['"]|['"]$/g, "");

  if (!cleaned || cleaned.startsWith("-") || cleaned === ".") return null;

  cleaned = cleaned.replace(/^npm:/, "");
  cleaned = cleaned.replace(/[?#].*$/, "");

  // Keep scoped names (@scope/pkg) while stripping trailing tags/versions
  // like pkg@latest, pkg@1.2.3, and @scope/pkg@latest.
  if (cleaned.startsWith("@")) {
    const scoped = cleaned.match(/^(@[^/\s]+\/[^@\s]+)(?:@[^\s]+)?$/);
    if (!scoped) return null;
    cleaned = scoped[1];
  } else {
    cleaned = cleaned.replace(/@[^/\s]+$/, "");
  }

  cleaned = cleaned.trim();
  if (!cleaned || cleaned.startsWith("-")) return null;

  return cleaned;
}

function isLocalPipInstallTarget(specifier) {
  if (!specifier) return false;
  const cleaned = String(specifier)
    .trim()
    .replace(/^['"]|['"]$/g, "");
  // pip install . / ./ / -e . handled via flags + target in the regex group
  return cleaned === "." || cleaned === "./" || /^\.\//.test(cleaned);
}

function cleanPipPackageSpec(specifier) {
  if (!specifier) return null;

  let cleaned = String(specifier)
    .trim()
    .replace(/^['"]|['"]$/g, "");

  if (!cleaned || cleaned.startsWith("-") || cleaned === ".") return null;

  if (/^(?:git\+|hg\+|svn\+|bzr\+|https?:|file:)/i.test(cleaned)) return null;

  cleaned = cleaned.replace(/@[^/@\[]+$/, "");
  cleaned = cleaned.replace(/\[[^\]]*\]$/, "");
  cleaned = cleaned.replace(/(?:===|==|!=|~=|>=|<=|>|<).*$/, "");

  cleaned = cleaned.trim();
  if (!cleaned || cleaned.startsWith("-")) return null;

  return cleaned;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function detectServiceConfigFromFiles(fileNames, packageName = "") {
  if (!fileNames?.length) return null;

  const hasLaunchdPlist = fileNames.some((f) => {
    const lower = f.toLowerCase();
    return (
      lower.endsWith(".plist") &&
      (lower.includes("launchagent") ||
        lower.includes("launchdaemon") ||
        lower.includes("launchd") ||
        lower.includes("/library/launchagents/") ||
        lower.includes("/library/launchdaemons/"))
    );
  });

  if (!hasLaunchdPlist) return null;
  return { command: packageName, keepAlive: true, confidence: "medium" };
}

export function detectBuildSystemFromFiles(fileNames): InstallMethodHint | null {
  const names = new Set(fileNames.map((f) => f.toLowerCase()));

  // Prefer explicit root install/setup scripts when present (curl|bash style).
  for (const candidate of [
    "install.sh",
    "setup.sh",
    "install.bash",
    "setup.bash",
  ]) {
    if (names.has(candidate)) {
      return { method: "script", script: candidate };
    }
  }

  if (names.has("go.mod")) return { method: "go" };
  if (names.has("cargo.toml")) return { method: "cargo" };
  // Prefer Python packaging markers over package.json so JS monorepo stubs
  // (private root package.json + packageManager pnpm) do not win over PyPI apps.
  if (names.has("setup.py") || names.has("pyproject.toml"))
    return { method: "pip" };
  if (names.has("package.json")) return { method: "npm" };
  if (names.has("package.swift")) return { method: "swift" };
  // Ruby gem CLI packages publish a root *.gemspec (e.g. license_finder.gemspec).
  // Prefer gemspec over Makefile when both exist (many gems ship a rake Makefile).
  const gemspec = fileNames.find((f) => /\.gemspec$/i.test(String(f)));
  if (gemspec) {
    const base = String(gemspec).split("/").pop() || "";
    const gemName = base.replace(/\.gemspec$/i, "");
    return { method: "gem", package: gemName || null };
  }
  if (names.has("cmakelists.txt")) return { method: "build", system: "cmake" };
  if (names.has("meson.build")) return { method: "build", system: "meson" };
  if (names.has("configure")) return { method: "build", system: "autotools" };
  if (names.has("makefile") || names.has("gnumakefile"))
    return { method: "build", system: "make" };

  return null;
}

export function detectBuildSystemFromArchive(fileNames) {
  const names = new Set(
    fileNames.map((f) => {
      const parts = f.split("/");
      return parts[parts.length - 1].toLowerCase();
    }),
  );

  if (
    names.has("install.sh") ||
    names.has("setup.sh") ||
    names.has("build.sh")
  ) {
    const script = fileNames.find((f) => {
      const base = f.split("/").pop().toLowerCase();
      return (
        base === "install.sh" || base === "setup.sh" || base === "build.sh"
      );
    });
    return { method: "script", script };
  }

  if (names.has("go.mod")) return { method: "go" };
  if (names.has("cmakelists.txt")) return { method: "build", system: "cmake" };
  if (names.has("cargo.toml")) return { method: "cargo" };
  if (names.has("setup.py") || names.has("pyproject.toml"))
    return { method: "pip" };
  if (names.has("package.json")) return { method: "npm" };
  if (names.has("meson.build")) return { method: "build", system: "meson" };
  if (names.has("configure")) return { method: "build", system: "autotools" };
  if (names.has("makefile") || names.has("gnumakefile"))
    return { method: "build", system: "make" };

  const hasReadme = fileNames.some((f) => {
    const base = f.split("/").pop().toLowerCase();
    return (
      base === "readme" ||
      base === "readme.md" ||
      base === "readme.txt" ||
      base === "install"
    );
  });

  if (hasReadme) return { method: "readme-inspect" };

  return null;
}
