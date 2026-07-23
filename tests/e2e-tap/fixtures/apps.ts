export type FixtureApp = {
  name: string;
  generator: string;
  version: string;
  github?: { owner: string; repo: string; description: string; license: string };
  packageName?: string;
  gemName?: string;
  crateName?: string;
  goModule?: string;
  appName?: string;
  buildSystem?: string;
  artifactKind: ArtifactKind;
  archAssets?: Record<string, string>;
  allbrewArgs?: string[];
};

export type ArtifactKind =
  | "binary-tarball"
  | "service-binary-tarball"
  | "source-tarball"
  | "install-script"
  | "npm-tarball"
  | "pip-sdist"
  | "crate-tarball"
  | "go-module-zip"
  | "gem-file"
  | "nupkg"
  | "dmg"
  | "zip-app"
  | "generic-archive";

export const FIXTURE_APPS: Record<string, FixtureApp> = {
  "fake-cli": {
    name: "fake-cli",
    generator: "binary-release",
    version: "1.0.0",
    github: { owner: "fake-org", repo: "fake-cli", description: "Fake CLI for E2E", license: "MIT" },
    artifactKind: "binary-tarball",
    archAssets: {
      "darwin-arm64": "darwin-arm64",
      "darwin-x86_64": "darwin-amd64",
    },
    allbrewArgs: [],
  },
  "fake-service": {
    name: "fake-service",
    generator: "binary-release",
    version: "1.0.0",
    github: { owner: "fake-org", repo: "fake-service", description: "Fake service binary for E2E", license: "MIT" },
    artifactKind: "service-binary-tarball",
    archAssets: {
      "darwin-arm64": "darwin-arm64",
      "darwin-x86_64": "darwin-amd64",
    },
    allbrewArgs: [],
  },
  "fake-src": {
    name: "fake-src",
    generator: "source-build",
    version: "1.0.0",
    github: { owner: "fake-org", repo: "fake-src", description: "Fake source build", license: "MIT" },
    artifactKind: "source-tarball",
    buildSystem: "make",
    allbrewArgs: ["--build-system", "make"],
  },
  "fake-spm": {
    name: "fake-spm",
    generator: "spm-package",
    version: "1.0.0",
    github: { owner: "fake-org", repo: "fake-spm", description: "Fake SPM package", license: "MIT" },
    artifactKind: "source-tarball",
    allbrewArgs: [],
  },
  "fake-mint": {
    name: "fake-mint",
    generator: "mint-package",
    version: "1.0.0",
    github: { owner: "fake-org", repo: "fake-mint", description: "Fake Mint package", license: "MIT" },
    artifactKind: "source-tarball",
    allbrewArgs: [],
  },
  "fake-cask-release": {
    name: "fake-cask-release",
    generator: "cask-app-release",
    version: "1.0.0",
    github: { owner: "fake-org", repo: "fake-cask-release", description: "Fake cask from release", license: "MIT" },
    artifactKind: "dmg",
    appName: "FakeCaskRelease",
    allbrewArgs: [],
  },
  "fake-npm": {
    name: "fake-npm",
    generator: "npm-package",
    version: "1.0.0",
    packageName: "fake-npm",
    artifactKind: "npm-tarball",
    allbrewArgs: ["--package", "fake-npm"],
  },
  "fake-pip": {
    name: "fake-pip",
    generator: "pip-package",
    version: "1.0.0",
    packageName: "fake-pip",
    artifactKind: "pip-sdist",
    allbrewArgs: ["--package", "fake-pip"],
  },
  "fake-cargo": {
    name: "fake-cargo",
    generator: "cargo-package",
    version: "1.0.0",
    github: { owner: "fake-org", repo: "fake-cargo", description: "Fake Cargo package", license: "MIT" },
    crateName: "fake-cargo",
    artifactKind: "crate-tarball",
    allbrewArgs: ["--crate-name", "fake-cargo"],
  },
  "fake-go": {
    name: "fake-go",
    generator: "go-package",
    version: "1.0.0",
    github: { owner: "fake-org", repo: "fake-go", description: "Fake Go package", license: "MIT" },
    goModule: "github.com/fake-org/fake-go",
    artifactKind: "go-module-zip",
    allbrewArgs: ["--go-module", "github.com/fake-org/fake-go"],
  },
  "fake-gem": {
    name: "fake-gem",
    generator: "gem-package",
    version: "1.0.0",
    gemName: "fake-gem",
    artifactKind: "gem-file",
    allbrewArgs: ["--gem-name", "fake-gem"],
  },
  "fake-dotnet": {
    name: "fake-dotnet",
    generator: "dotnet-package",
    version: "1.0.0",
    packageName: "fake-dotnet",
    artifactKind: "nupkg",
    allbrewArgs: ["--package", "fake-dotnet"],
  },
  "fake-install": {
    name: "fake-install",
    generator: "install-script",
    version: "1.0.0",
    artifactKind: "install-script",
    allbrewArgs: [],
  },
  "fake-archive": {
    name: "fake-archive",
    generator: "archive-build",
    version: "1.0.0",
    artifactKind: "generic-archive",
    allbrewArgs: [],
  },
  "fake-binary-direct": {
    name: "fake-binary-direct",
    generator: "binary-direct",
    version: "1.0.0",
    artifactKind: "binary-tarball",
    allbrewArgs: [],
  },
  "fake-cask": {
    name: "fake-cask",
    generator: "cask-app",
    version: "1.0.0",
    artifactKind: "dmg",
    appName: "FakeCask",
    allbrewArgs: [],
  },
};

export function getFixtureApp(key: string): FixtureApp {
  const app = FIXTURE_APPS[key];
  if (!app) throw new Error(`Unknown fixture app: ${key}`);
  return app;
}

export function githubUrl(app: FixtureApp): string {
  if (!app.github) throw new Error(`App ${app.name} has no GitHub config`);
  return `https://github.com/${app.github.owner}/${app.github.repo}`;
}

export function npmUrl(app: FixtureApp): string {
  return `https://www.npmjs.com/package/${app.packageName}`;
}

export function pypiUrl(app: FixtureApp): string {
  return `https://pypi.org/project/${app.packageName}`;
}

export function rubygemsUrl(app: FixtureApp): string {
  return `https://rubygems.org/gems/${app.gemName}`;
}

export function nugetUrl(app: FixtureApp): string {
  return `https://www.nuget.org/packages/${app.packageName}`;
}

export function directUrl(app: FixtureApp, baseUrl: string): string {
  return `${baseUrl}/direct/${app.name}/${app.version}`;
}

export function classifierUrl(app: FixtureApp, baseUrl: string): string {
  switch (app.generator) {
    case "binary-release":
    case "source-build":
    case "spm-package":
    case "mint-package":
    case "cargo-package":
    case "go-package":
    case "cask-app-release":
      return githubUrl(app);
    case "npm-package":
      return npmUrl(app);
    case "pip-package":
      return pypiUrl(app);
    case "gem-package":
      return rubygemsUrl(app);
    case "dotnet-package":
      return nugetUrl(app);
    case "install-script":
      return `${baseUrl}/direct/${app.name}/${app.version}/install.sh`;
    case "archive-build":
      return `${baseUrl}/direct/${app.name}/${app.version}/archive.tar.gz`;
    case "binary-direct":
      return `${baseUrl}/direct/${app.name}/${app.version}/binary.tar.gz`;
    case "cask-app":
      return `${baseUrl}/direct/${app.name}/${app.version}/app.dmg`;
    default:
      throw new Error(`No classifier URL for generator: ${app.generator}`);
  }
}

function caskAppDir(): string {
  const opts = process.env.HOMEBREW_CASK_OPTS || "";
  const match = opts.match(/--appdir[\s=]+([^\s]+)/);
  if (match) return match[1].replace(/^~/, process.env.HOME || "~");
  return "/Applications";
}

export function verifyCommand(app: FixtureApp): string[] {
  if (isCaskGenerator(app.generator)) {
    const appName = app.appName || app.name;
    return [`${caskAppDir()}/${appName}.app/Contents/MacOS/${appName}`, "--version"];
  }
  return [app.name, "--version"];
}

export function isCaskGenerator(generator: string): boolean {
  return generator === "cask-app" || generator === "cask-app-release";
}

export function requiredToolchain(app: FixtureApp): string | null {
  switch (app.generator) {
    case "npm-package": return "node";
    case "pip-package": return "python3";
    case "cargo-package": return "cargo";
    case "go-package": return "go";
    case "gem-package": return "gem";
    case "dotnet-package": return "dotnet";
    case "spm-package": return "swift";
    case "mint-package": return "mint";
    default: return null;
  }
}
