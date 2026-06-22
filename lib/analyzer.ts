const BREW_INSTALL_RE = /brew\s+install\s+(?:--cask\s+)?([^\s;|&\n]+)/gi;
const BREW_TAP_RE = /brew\s+tap\s+([^\s;|&\n]+)/gi;
const BREW_CASK_RE =
  /brew\s+(?:cask\s+install|install\s+--cask)\s+([^\s;|&\n]+)/gi;

const NPM_INSTALL_RE =
  /(?:^|[`\n])\s*(?:\$\s*)?npm[ \t]+(?:install|i)[ \t]+(?:-g[ \t]+)?([^\s;|&\n`]+)/i;
const PNPM_INSTALL_RE =
  /(?:^|[`\n])\s*(?:\$\s*)?pnpm[ \t]+(?:install|add)[ \t]+(?:-g[ \t]+)?([^\s;|&\n`]+)/i;
const YARN_GLOBAL_ADD_RE =
  /(?:^|[`\n])\s*(?:\$\s*)?yarn[ \t]+global[ \t]+add[ \t]+([^\s;|&\n`]+)/i;
const BUN_INSTALL_RE =
  /(?:^|[`\n])\s*(?:\$\s*)?bun[ \t]+(?:install|add)[ \t]+(?:-g[ \t]+|--global[ \t]+)?([^\s;|&\n`]+)/i;
const NPX_RE = /(?:^|[`\n])\s*(?:\$\s*)?npx[ \t]+([^\s;|&\n`]+)/i;
const PIP_INSTALL_RE =
  /(?:^|[`\n])\s*(?:\$\s*)?pip[3]?[ \t]+install[ \t]+([^\s;|&\n`]+)/i;
const PIPX_INSTALL_RE =
  /(?:^|[`\n])\s*(?:\$\s*)?pipx[ \t]+install[ \t]+([^\s;|&\n`]+)/i;
const UV_TOOL_INSTALL_RE =
  /(?:^|[`\n])\s*(?:\$\s*)?uv[ \t]+(?:tool[ \t]+install|pip[ \t]+install)[ \t]+([^\s;|&\n`]+)/i;
const DENO_INSTALL_RE =
  /(?:^|[`\n])\s*(?:\$\s*)?deno[ \t]+install\b[^\n`]*(?:\s(?:--name|-n)[ =]([^\s;|&\n`]+)|\s([\w./:@-]+))(?:[^\n`]*)/i;
const SWIFT_RUN_RE =
  /(?:^|[`\n])\s*(?:\$\s*)?swift[ \t]+run(?:[ \t]+(?:-c|--configuration)[ \t]+\w+)?(?:[ \t]+([^\s;|&\n`]+))?/i;
const CARGO_INSTALL_RE =
  /(?:^|[`\n])\s*(?:\$\s*)?cargo[ \t]+install[ \t]+(?:--locked[ \t]+|--force[ \t]+)?(?!--path\b|--git\b|--)([a-zA-Z][a-zA-Z0-9_-]*)/i;
const GO_INSTALL_RE =
  /(?:^|[`\n])\s*(?:\$\s*)?go[ \t]+install[ \t]+([\w./-]+@[\w.]+)/i;

const BUILD_PATTERNS = [
  { pattern: /cmake\s+/i, system: "cmake" },
  { pattern: /\.\/configure/i, system: "autotools" },
  { pattern: /make\s+(?:install|all|build)?/i, system: "make" },
  { pattern: /meson\s+/i, system: "meson" },
  { pattern: /\bgo\s+build\b/i, system: "go" },
  { pattern: /\b(?:python[3]?\s+-m\s+pip|pip[3]?)\s+install\s+(?:-[a-zA-Z]+\s+)*\./i, system: "python" },
];

const SERVICE_HINT_RE =
  /\b(?:brew\s+services|launchctl|launchd|launch\s*agent|launch\s*daemon|daemon|service|background\s+process|run\s+in\s+the\s+background|start\s+on\s+login)\b/i;
const SERVICE_COMMAND_RE =
  /(?:^|[\n`])\s*(?:\$\s*)?([a-zA-Z0-9._/-]+(?:\s+(?:serve|server|start|daemon|agent|run|--daemon|--service)\b[^\n`]*)?)/gm;
const LOCAL_ENDPOINT_RE =
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/[\w./~:%?#[\]@!$&'()*+,;=-]*)?/gi;
const WEB_SERVICE_CONTEXT_RE =
  /\b(?:api|dashboard|web\s*ui|ui|server|serve|gateway|proxy|endpoint|base\s+url|listens?|listening|available\s+at|runs?\s+at|open\s+in\s+(?:a\s+)?browser)\b/i;
const NON_RUN_COMMAND_RE =
  /^(?:brew|launchctl|sudo|systemctl|make|curl|wget|git|docker|podman|export|cp|mkdir|cd|echo|cat)\b/i;
const INSTALL_COMMAND_RE =
  /^(?:(?:npm|pnpm|yarn|bun)[ \t]+(?:install|i|add)\b|yarn[ \t]+global[ \t]+add\b|(?:pip|pip3|pipx)[ \t]+install\b|uv[ \t]+(?:tool[ \t]+install|pip[ \t]+install)\b|cargo[ \t]+install\b|go[ \t]+install\b|deno[ \t]+install\b|swift[ \t]+package\b.*\binstall\b)/i;
const STATUS_LINE_RE =
  /^(?:api|dashboard|endpoint|listening|server|ui|web\s*ui)\s+(?:at|on|is|available|running)\b/i;

export function detectBrewInstall(readmeText) {
  if (!readmeText) return null;

  const commands = [];
  let match;

  const brewInstallRe = /brew\s+install\s+(?:--cask\s+)?([^\s;|&\n`]+)/gi;
  while ((match = brewInstallRe.exec(readmeText)) !== null) {
    commands.push({ command: match[0].trim(), package: match[1] });
  }

  const brewCaskRe =
    /brew\s+(?:cask\s+install|install\s+--cask)\s+([^\s;|&\n`]+)/gi;
  while ((match = brewCaskRe.exec(readmeText)) !== null) {
    commands.push({
      command: match[0].trim(),
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

  const primary = commands[0];
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

export function detectInstallMethod(readmeText) {
  if (!readmeText) return null;

  let match;

  match = readmeText.match(NPM_INSTALL_RE);
  if (match) return { method: "npm", package: match[1] };

  match = readmeText.match(PNPM_INSTALL_RE);
  if (match) return { method: "npm", package: match[1] };

  match = readmeText.match(YARN_GLOBAL_ADD_RE);
  if (match) return { method: "npm", package: match[1] };

  match = readmeText.match(BUN_INSTALL_RE);
  if (match) return { method: "npm", package: match[1] };

  match = readmeText.match(NPX_RE);
  if (match) return { method: "npm", package: match[1] };

  match = readmeText.match(PIP_INSTALL_RE);
  if (match) return { method: "pip", package: match[1] };

  match = readmeText.match(PIPX_INSTALL_RE);
  if (match) return { method: "pip", package: match[1] };

  match = readmeText.match(UV_TOOL_INSTALL_RE);
  if (match) return { method: "pip", package: match[1] };

  match = readmeText.match(CARGO_INSTALL_RE);
  if (match) return { method: "cargo", package: match[1] };

  match = readmeText.match(GO_INSTALL_RE);
  if (match) return { method: "go", package: match[1] };

  match = readmeText.match(DENO_INSTALL_RE);
  if (match)
    return {
      method: "deno",
      package: match[1] || packageNameFromSpecifier(match[2]),
    };

  match = readmeText.match(SWIFT_RUN_RE);
  if (match) return { method: "swift", package: match[1] || null };

  for (const { pattern, system } of BUILD_PATTERNS) {
    if (pattern.test(readmeText)) {
      return { method: "build", system };
    }
  }

  return null;
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
    if (
      /\b(?:serve|server|start|daemon|agent|run|--daemon|--service)\b/i.test(
        command,
      )
    ) {
      commands.push(command);
    }
  }

  const preferred = preferPackageCommand(commands, packageName) || commands[0];

  return {
    command: preferred || packageName,
    keepAlive: true,
    confidence: preferred ? "medium" : "low",
    reason: "README contains service/daemon wording",
  };
}

function detectLocalWebService(readmeText, packageName) {
  LOCAL_ENDPOINT_RE.lastIndex = 0;
  const endpoints = [...readmeText.matchAll(LOCAL_ENDPOINT_RE)];
  if (endpoints.length === 0) return null;

  const hasWebServiceContext = endpoints.some((endpoint) => {
    const index = endpoint.index || 0;
    const nearby = readmeText.slice(Math.max(0, index - 180), index + 220);
    return WEB_SERVICE_CONTEXT_RE.test(nearby);
  });

  if (!hasWebServiceContext) return null;

  const command =
    findCommandNearEndpoint(readmeText, endpoints[0].index || 0, packageName) ||
    findPackageRunCommand(readmeText, packageName) ||
    packageName;

  if (!command) return null;

  const executable = command.split(/\s+/)[0].split("/").pop();

  return {
    command,
    keepAlive: true,
    confidence: executable === packageName ? "high" : "medium",
    reason:
      "README shows a local web/API endpoint started by the package command",
    endpoints: endpoints.map((endpoint) => cleanEndpoint(endpoint[0])),
  };
}

function findCommandNearEndpoint(readmeText, endpointIndex, packageName) {
  const beforeEndpoint = readmeText.slice(0, endpointIndex);
  const fencedBlocks = [
    ...beforeEndpoint.matchAll(/```[^\n`]*\n([\s\S]*?)```/g),
  ];
  const nearestBlock = fencedBlocks.at(-1)?.[1];
  if (nearestBlock) {
    const command = findRunnableCommandInText(nearestBlock, packageName);
    if (command) return command;
  }

  const nearbyLines = beforeEndpoint.split(/\r?\n/).slice(-12).join("\n");
  return findRunnableCommandInText(nearbyLines, packageName);
}

function findPackageRunCommand(readmeText, packageName) {
  if (!packageName) return null;

  const escapedName = escapeRegExp(packageName);
  const installThenRunPatterns = [
    `(?:npm|pnpm|bun)[ \\t]+(?:install|add|i)[ \\t]+(?:-g[ \\t]+|--global[ \\t]+)?${escapedName}`,
    `yarn[ \\t]+global[ \\t]+add[ \\t]+${escapedName}`,
    `(?:pip|pip3|pipx)[ \\t]+install[ \\t]+${escapedName}`,
    `uv[ \\t]+(?:tool[ \\t]+install|pip[ \\t]+install)[ \\t]+${escapedName}`,
    `cargo[ \\t]+install[ \\t]+(?:--locked[ \\t]+|--force[ \\t]+)?${escapedName}`,
    `deno[ \\t]+install\\b[^\\n]*(?:--name|-n)[ =]${escapedName}`,
    `swift[ \\t]+package\\b[^\\n]*\\binstall\\b[^\\n]*${escapedName}`,
  ];

  for (const pattern of installThenRunPatterns) {
    const installThenRun = new RegExp(
      `${pattern}[\\s\\S]{0,500}?(?:^|\\n)\\s*(?:\\$\\s*)?(${escapedName}(?:[ \\t]+[^\\n]+)?)`,
      "im",
    );
    const match = readmeText.match(installThenRun);
    if (match) return cleanCommand(match[1]);
  }

  return findRunnableCommandInText(readmeText, packageName);
}

function findRunnableCommandInText(text, packageName) {
  const commands = text
    .split(/\r?\n/)
    .map(cleanCommand)
    .filter(isRunnableCommand);

  return preferPackageCommand(commands, packageName) || commands.at(-1) || null;
}

function preferPackageCommand(commands, packageName) {
  if (!packageName) return null;
  return commands.find((command) => {
    const executable = command.split(/\s+/)[0].split("/").pop();
    return executable === packageName;
  });
}

function isRunnableCommand(command) {
  if (!command) return false;
  if (NON_RUN_COMMAND_RE.test(command)) return false;
  if (INSTALL_COMMAND_RE.test(command)) return false;
  if (STATUS_LINE_RE.test(command)) return false;
  if (/^(?:#|\/\/)/.test(command)) return false;
  if (/https?:\/\//i.test(command)) return false;
  return /^[a-zA-Z0-9._/-]+(?:\s+[^\n]+)?$/.test(command);
}

function cleanEndpoint(endpoint) {
  return String(endpoint).replace(/[.,;:!?]+$/, "");
}

function cleanCommand(line) {
  return String(line || "")
    .replace(/^\s*(?:\$|>)\s*/, "")
    .replace(/\s+#.*$/, "")
    .replace(/\s+\/\/.*$/, "")
    .trim();
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

export function detectBuildSystemFromFiles(fileNames) {
  const names = new Set(fileNames.map((f) => f.toLowerCase()));

  if (names.has("go.mod")) return { method: "go" };
  if (names.has("cargo.toml")) return { method: "cargo" };
  if (names.has("package.json")) return { method: "npm" };
  if (names.has("setup.py") || names.has("pyproject.toml"))
    return { method: "pip" };
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
  if (names.has("package.json")) return { method: "npm" };
  if (names.has("setup.py") || names.has("pyproject.toml"))
    return { method: "pip" };
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
