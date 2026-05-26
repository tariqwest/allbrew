const BREW_INSTALL_RE = /brew\s+install\s+(?:--cask\s+)?([^\s;|&\n]+)/gi;
const BREW_TAP_RE = /brew\s+tap\s+([^\s;|&\n]+)/gi;
const BREW_CASK_RE = /brew\s+(?:cask\s+install|install\s+--cask)\s+([^\s;|&\n]+)/gi;

const NPM_INSTALL_RE = /npm\s+(?:install|i)\s+(?:-g\s+)?([^\s;|&\n]+)/i;
const NPX_RE = /npx\s+([^\s;|&\n]+)/i;
const PIP_INSTALL_RE = /pip[3]?\s+install\s+([^\s;|&\n]+)/i;
const PIPX_INSTALL_RE = /pipx\s+install\s+([^\s;|&\n]+)/i;
const CARGO_INSTALL_RE = /cargo\s+install\s+(?:--locked\s+|--force\s+)?(?!--path\b|--git\b|--)([a-zA-Z][a-zA-Z0-9_-]*)/i;
const GO_INSTALL_RE = /go\s+install\s+([\w./-]+@[\w.]+)/i;

const BUILD_PATTERNS = [
  { pattern: /cmake\s+/i, system: 'cmake' },
  { pattern: /\.\/configure/i, system: 'autotools' },
  { pattern: /make\s+(?:install|all|build)?/i, system: 'make' },
  { pattern: /meson\s+/i, system: 'meson' },
  { pattern: /go\s+build/i, system: 'go' },
];

export function detectBrewInstall(readmeText) {
  if (!readmeText) return null;

  const commands = [];
  let match;

  const brewInstallRe = /brew\s+install\s+(?:--cask\s+)?([^\s;|&\n`]+)/gi;
  while ((match = brewInstallRe.exec(readmeText)) !== null) {
    commands.push({ command: match[0].trim(), package: match[1] });
  }

  const brewCaskRe = /brew\s+(?:cask\s+install|install\s+--cask)\s+([^\s;|&\n`]+)/gi;
  while ((match = brewCaskRe.exec(readmeText)) !== null) {
    commands.push({ command: match[0].trim(), package: match[1], isCask: true });
  }

  const taps = [];
  const brewTapRe = /brew\s+tap\s+([^\s;|&\n`]+)/gi;
  while ((match = brewTapRe.exec(readmeText)) !== null) {
    taps.push(match[1]);
  }

  if (commands.length === 0) return null;

  const primary = commands[0];
  return {
    installCommand: taps.length > 0
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
  if (match) return { method: 'npm', package: match[1] };

  match = readmeText.match(NPX_RE);
  if (match) return { method: 'npm', package: match[1] };

  match = readmeText.match(PIP_INSTALL_RE);
  if (match) return { method: 'pip', package: match[1] };

  match = readmeText.match(PIPX_INSTALL_RE);
  if (match) return { method: 'pip', package: match[1] };

  match = readmeText.match(CARGO_INSTALL_RE);
  if (match) return { method: 'cargo', package: match[1] };

  match = readmeText.match(GO_INSTALL_RE);
  if (match) return { method: 'go', package: match[1] };

  for (const { pattern, system } of BUILD_PATTERNS) {
    if (pattern.test(readmeText)) {
      return { method: 'build', system };
    }
  }

  return null;
}

export function detectBuildSystemFromFiles(fileNames) {
  const names = new Set(fileNames.map(f => f.toLowerCase()));

  if (names.has('go.mod')) return { method: 'go' };
  if (names.has('cargo.toml')) return { method: 'cargo' };
  if (names.has('package.json')) return { method: 'npm' };
  if (names.has('setup.py') || names.has('pyproject.toml')) return { method: 'pip' };
  if (names.has('cmakelists.txt')) return { method: 'build', system: 'cmake' };
  if (names.has('meson.build')) return { method: 'build', system: 'meson' };
  if (names.has('configure')) return { method: 'build', system: 'autotools' };
  if (names.has('makefile') || names.has('gnumakefile')) return { method: 'build', system: 'make' };

  return null;
}

export function detectBuildSystemFromArchive(fileNames) {
  const names = new Set(fileNames.map(f => {
    const parts = f.split('/');
    return parts[parts.length - 1].toLowerCase();
  }));

  if (names.has('install.sh') || names.has('setup.sh') || names.has('build.sh')) {
    const script = fileNames.find(f => {
      const base = f.split('/').pop().toLowerCase();
      return base === 'install.sh' || base === 'setup.sh' || base === 'build.sh';
    });
    return { method: 'script', script };
  }

  if (names.has('go.mod')) return { method: 'go' };
  if (names.has('cmakelists.txt')) return { method: 'build', system: 'cmake' };
  if (names.has('cargo.toml')) return { method: 'cargo' };
  if (names.has('package.json')) return { method: 'npm' };
  if (names.has('setup.py') || names.has('pyproject.toml')) return { method: 'pip' };
  if (names.has('meson.build')) return { method: 'build', system: 'meson' };
  if (names.has('configure')) return { method: 'build', system: 'autotools' };
  if (names.has('makefile') || names.has('gnumakefile')) return { method: 'build', system: 'make' };

  const hasReadme = fileNames.some(f => {
    const base = f.split('/').pop().toLowerCase();
    return base === 'readme' || base === 'readme.md' || base === 'readme.txt' || base === 'install';
  });

  if (hasReadme) return { method: 'readme-inspect' };

  return null;
}
