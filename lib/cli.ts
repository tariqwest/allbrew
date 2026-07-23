import { select, input, confirm, checkbox } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import { classify, classifyWithHead } from "./classifier.ts";
import {
  initOctokit,
  getRepoInfo,
  getLatestRelease,
  getReadme,
  getRepoContents,
  getFileContent,
} from "./github.ts";
import {
  detectBrewInstall,
  detectInstallMethod,
  detectBuildSystemFromFiles,
  detectServiceConfig,
  detectServiceConfigFromFiles,
} from "./analyzer.ts";
import { inspectArchive } from "./archive-inspector.ts";
import { matchAssetToArch, isAppAsset, isBinaryAsset } from "./utils.ts";
import { buildManifest } from "./build-manifest.ts";
import { saveManifest } from "./manifest.ts";
import type { GeneratorName } from "./manifest.ts";
import { commitAndPushTap } from "./tap-git.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function run(url, opts: any = {}) {
  if (opts.token) initOctokit(opts.token);

  if (opts.manual) {
    return await runManual(url, opts);
  }

  console.log();
  const spinner = ora(`Analyzing ${chalk.cyan(url)}...`).start();

  let classification;
  try {
    classification = await classifyWithHead(url);
  } catch (err) {
    spinner.fail(`Failed to classify URL: ${err.message}`);
    process.exit(1);
  }

  spinner.succeed(`Classified as: ${chalk.bold(classification.type)}`);

  try {
    switch (classification.type) {
      case "github-repo":
        return await handleGithubRepo(classification, opts);
      case "bash-script":
        return await handleBashScript(classification.url, opts);
      case "cask-dmg":
        return await handleCaskDmg(classification.url, opts);
      case "archive":
        return await handleArchive(classification.url, opts);
      case "mac-app-store":
        return await handleMacAppStore(classification.url, opts);
      case "setapp-app":
        return await handleSetappApp(classification.url, opts);
      case "npm-package":
        return await handleNpmPackage(classification, opts);
      case "pip-package":
        return await handlePipPackage(classification, opts);
      case "gem-package":
        return await handleGemPackage(classification, opts);
      case "dotnet-package":
        return await handleDotnetPackage(classification, opts);
      default:
        console.log(
          chalk.yellow(
            `\nUnable to automatically determine how to handle this URL.`,
          ),
        );
        const choice = await select({
          message: "What type of content does this URL point to?",
          choices: [
            { name: "Bash/shell install script", value: "bash-script" },
            { name: "Archive containing source code", value: "archive" },
            { name: "Archive containing a pre-built binary", value: "archive" },
            {
              name: "DMG or archive containing a macOS .app",
              value: "cask-dmg",
            },
          ],
        });
        switch (choice) {
          case "bash-script":
            return await handleBashScript(classification.url, opts);
          case "cask-dmg":
            return await handleCaskDmg(classification.url, opts);
          case "archive":
            return await handleArchive(classification.url, opts);
        }
    }
  } catch (err) {
    console.error(chalk.red(`\nError: ${err.message}`));
    if (opts.verbose) console.error(err.stack);
    process.exit(1);
  }
}

async function runManual(url, opts) {
  console.log();
  console.log(
    chalk.bold("Manual mode") +
      chalk.dim(" — choose how this URL should be packaged"),
  );
  console.log();

  const urlType = await select({
    message: "What does this URL point to?",
    choices: [
      { name: "GitHub repository", value: "github-repo" },
      { name: "Bash / shell install script", value: "bash-script" },
      { name: "macOS app (.dmg or .zip containing .app)", value: "cask-dmg" },
      { name: "Mac App Store link", value: "mac-app-store" },
      { name: "Setapp app link", value: "setapp-app" },
      { name: "Archive (source code, binary, or app)", value: "archive" },
    ],
  });

  try {
    switch (urlType) {
      case "github-repo":
        return await handleGithubRepoManual(url, opts);
      case "bash-script":
        return await handleBashScript(url, opts);
      case "cask-dmg":
        return await handleCaskDmg(url, opts);
      case "mac-app-store":
        return await handleMacAppStore(url, opts);
      case "setapp-app":
        return await handleSetappApp(url, opts);
      case "archive":
        return await handleArchiveManual(url, opts);
    }
  } catch (err) {
    console.error(chalk.red(`\nError: ${err.message}`));
    if (opts.verbose) console.error(err.stack);
    process.exit(1);
  }
}

async function handleGithubRepoManual(url, opts) {
  const ghMatch = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!ghMatch) {
    console.log(
      chalk.yellow(
        "URL does not look like a GitHub repo. Attempting to use it as-is.",
      ),
    );
  }

  const owner = ghMatch?.[1];
  const repo = ghMatch?.[2]
    ?.replace(/\.git$/, "")
    .replace(/\/(tree|blob)\/.*$/, "");

  let repoInfo = null;
  let release = null;

  if (owner && repo) {
    const spinner = ora("Fetching repository info...").start();
    try {
      repoInfo = await getRepoInfo(owner, repo);
      spinner.succeed(`Repository: ${chalk.bold(repoInfo.fullName)}`);
    } catch {
      spinner.warn(
        "Could not fetch repo info, continuing with manual selections",
      );
    }

    const releaseSpinner = ora("Checking for releases...").start();
    try {
      release = await getLatestRelease(owner, repo);
      if (release) {
        releaseSpinner.succeed(
          `Latest release: ${chalk.bold(release.tagName)} (${release.assets.length} assets)`,
        );
      } else {
        releaseSpinner.info("No releases found");
      }
    } catch {
      releaseSpinner.info("Could not fetch releases");
    }
  }

  console.log();
  const strategy = await select({
    message: "How should this package be installed?",
    choices: [
      {
        name: "Binary release — install pre-built binaries from GitHub releases",
        value: "binary-release",
        disabled: !release ? "(no releases found)" : false,
      },
      {
        name: "App cask — install .dmg/.zip app bundle from GitHub releases",
        value: "cask-app-release",
        disabled: !release ? "(no releases found)" : false,
      },
      { name: "npm package — install via Node.js / npm", value: "npm-package" },
      { name: "pip package — install via Python / pip", value: "pip-package" },
      {
        name: "cargo package — build via Rust / cargo",
        value: "cargo-package",
      },
      { name: "Go package — build via Go / go install", value: "go-package" },
      {
        name: "Swift SPM — build via Swift Package Manager",
        value: "spm-package",
      },
      {
        name: ".NET global tool — install via dotnet tool install",
        value: "dotnet-package",
      },
      {
        name: "Ruby gem — install via gem install",
        value: "gem-package",
      },
      {
        name: "Swift Mint — install Swift CLI via mint install",
        value: "mint-package",
      },
      {
        name: "Build from source — cmake / make / autotools / meson",
        value: "source-build",
      },
    ],
  });

  switch (strategy) {
    case "binary-release":
      return await generateWithConfirmation(
        "binary-release",
        { repoInfo, release },
        opts,
      );

    case "cask-app-release":
      return await generateWithConfirmation(
        "cask-app-release",
        { repoInfo, release },
        opts,
      );

    case "npm-package": {
      const packageName = await input({
        message: "npm package name:",
        default: repoInfo?.name || "",
      });
      return await generateWithConfirmation(
        "npm-package",
        { packageName, repoInfo },
        opts,
      );
    }

    case "pip-package": {
      const packageName = await input({
        message: "PyPI package name:",
        default: repoInfo?.name || "",
      });
      return await generateWithConfirmation(
        "pip-package",
        { packageName, repoInfo },
        opts,
      );
    }

    case "cargo-package": {
      const crateName = await input({
        message: "crates.io crate name:",
        default: repoInfo?.name || "",
      });
      return await generateWithConfirmation(
        "cargo-package",
        { repoInfo, release, crateName },
        opts,
      );
    }

    case "go-package": {
      const goModule = await input({
        message: "Go module path (e.g. github.com/user/tool):",
        default: repoInfo ? `github.com/${repoInfo.fullName}` : "",
      });
      return await generateWithConfirmation(
        "go-package",
        { repoInfo, release, goModule },
        opts,
      );
    }

    case "spm-package": {
      return await generateWithConfirmation(
        "spm-package",
        { repoInfo, release },
        opts,
      );
    }

    case "dotnet-package": {
      const packageName = await input({
        message: "NuGet package name:",
        default: repoInfo?.name || "",
      });
      return await generateWithConfirmation(
        "dotnet-package",
        { packageName, repoInfo },
        opts,
      );
    }

    case "gem-package": {
      const gemName = await input({
        message: "Ruby gem name:",
        default: repoInfo?.name || "",
      });
      return await generateWithConfirmation(
        "gem-package",
        { gemName, repoInfo },
        opts,
      );
    }

    case "mint-package": {
      return await generateWithConfirmation(
        "mint-package",
        { repoInfo, release },
        opts,
      );
    }

    case "source-build": {
      const system = await select({
        message: "Build system:",
        choices: [
          { name: "cmake", value: "cmake" },
          { name: "autotools (./configure && make)", value: "autotools" },
          { name: "make", value: "make" },
          { name: "meson", value: "meson" },
          { name: "go build", value: "go" },
        ],
      });
      return await generateWithConfirmation(
        "source-build",
        {
          repoInfo,
          release,
          buildSystem: { system },
        },
        opts,
      );
    }
  }
}

async function handleArchiveManual(url: string, opts: any) {
  const archiveType = await select({
    message: "What does this archive contain?",
    choices: [
      { name: "Source code (will be built from source)", value: "source" },
      { name: "Pre-built binary executable(s)", value: "binary" },
      { name: "macOS .app bundle", value: "app" },
    ],
  });

  if (archiveType === "app") {
    return await generateWithConfirmation("cask-app", { url }, opts);
  }

  const spinner = ora("Downloading and inspecting archive...").start();
  const archiveInfo: any = await inspectArchive(url);
  spinner.succeed("Archive downloaded");
  const archiveServiceConfig = detectServiceConfigFromFiles(
    archiveInfo.files,
    opts.name || "",
  );
  if (archiveServiceConfig) {
    console.log(
      `  Detected service/launchagent files${archiveServiceConfig.confidence ? ` (${archiveServiceConfig.confidence} confidence)` : ""}`,
    );
  }

  if (archiveType === "source") {
    const buildMethod = await select({
      message: "Build system to use:",
      choices: [
        { name: "Auto-detect from archive contents", value: "auto" },
        { name: "cmake", value: "cmake" },
        { name: "autotools (./configure && make)", value: "autotools" },
        { name: "make", value: "make" },
        { name: "meson", value: "meson" },
        { name: "Run install.sh / setup.sh script", value: "script" },
      ],
    });

    if (buildMethod !== "auto") {
      archiveInfo.forcedBuildSystem = { method: "build", system: buildMethod };
      if (buildMethod === "script") {
        const scriptName = await input({
          message: "Script filename in archive:",
          default: "install.sh",
        });
        archiveInfo.forcedBuildSystem = {
          method: "script",
          script: scriptName,
        };
      }
    }
    return await generateWithConfirmation(
      "archive-build",
      { archiveInfo, serviceConfig: archiveServiceConfig },
      opts,
    );
  }

  if (archiveType === "binary") {
    if (archiveInfo.binaries?.length > 0) {
      console.log(
        `  Found ${chalk.cyan(archiveInfo.binaries.length)} executable(s): ${archiveInfo.binaries.map((b) => b.split("/").pop()).join(", ")}`,
      );
      let selected = archiveInfo.binaries;
      if (archiveInfo.binaries.length > 1) {
        selected = await checkbox({
          message: "Select which binaries to install:",
          choices: archiveInfo.binaries.map((b) => ({
            name: b.split("/").pop(),
            value: b,
            checked: true,
          })),
        });
      }
      return await generateWithConfirmation(
        "binary-direct",
        {
          archiveInfo,
          selectedBinaries: selected,
          serviceConfig: archiveServiceConfig,
        },
        opts,
      );
    }

    console.log(
      chalk.dim(
        "  No executables auto-detected. Listing all files for you to pick.",
      ),
    );
    if (archiveInfo.files.length === 0) {
      throw new Error("Archive appears to be empty");
    }
    const selected = await checkbox({
      message: "Select files to install as binaries:",
      choices: archiveInfo.files.map((f) => ({
        name: f.split("/").pop(),
        value: f,
      })),
    });
    archiveInfo.binaries = selected;
    return await generateWithConfirmation(
      "binary-direct",
      {
        archiveInfo,
        selectedBinaries: selected,
        serviceConfig: archiveServiceConfig,
      },
      opts,
    );
  }
}

async function dispatchGithubRepoType(repoInfo, release, opts) {
  switch (opts.type) {
    case "npm-package":
      return await generateWithConfirmation(
        "npm-package",
        { packageName: opts.package || repoInfo.name, repoInfo },
        opts,
      );
    case "pip-package":
      return await generateWithConfirmation(
        "pip-package",
        { packageName: opts.package || repoInfo.name, repoInfo },
        opts,
      );
    case "gem-package":
      return await generateWithConfirmation(
        "gem-package",
        { gemName: opts.gemName || repoInfo.name, repoInfo },
        opts,
      );
    case "dotnet-package":
      return await generateWithConfirmation(
        "dotnet-package",
        { packageName: opts.package || repoInfo.name, repoInfo },
        opts,
      );
    case "cargo-package":
      return await generateWithConfirmation(
        "cargo-package",
        {
          repoInfo,
          release,
          crateName: opts.crateName || repoInfo.name,
        },
        opts,
      );
    case "go-package":
      return await generateWithConfirmation(
        "go-package",
        {
          repoInfo,
          release,
          goModule: opts.goModule || `github.com/${repoInfo.fullName}`,
        },
        opts,
      );
    case "spm-package":
      return await generateWithConfirmation(
        "spm-package",
        { repoInfo, release },
        opts,
      );
    case "mint-package":
      return await generateWithConfirmation(
        "mint-package",
        { repoInfo, release },
        opts,
      );
    case "source-build":
      return await generateWithConfirmation(
        "source-build",
        {
          repoInfo,
          release,
          buildSystem: { system: opts.buildSystem || "make" },
        },
        opts,
      );
    case "binary-release":
      return await generateWithConfirmation(
        "binary-release",
        { repoInfo, release },
        opts,
      );
    case "cask-app-release":
      return await generateWithConfirmation(
        "cask-app-release",
        { repoInfo, release },
        opts,
      );
    default:
      throw new Error(
        `Unknown generator type: ${opts.type}. See --help for supported types.`,
      );
  }
}

async function handleGithubRepo(classification, opts) {
  const { owner, repo } = classification;
  let repoInfo: any = null;
  let release: any = null;
  let releaseSpinner: any = null;

  try {
    const spinner = ora("Fetching repository info...").start();
    repoInfo = await getRepoInfo(owner, repo);
    spinner.succeed(
      `Repository: ${chalk.bold(repoInfo.fullName)} - ${repoInfo.description || "No description"}`,
    );

    if (repoInfo.license) {
      console.log(`  License: ${chalk.dim(repoInfo.license)}`);
    }

    // Step 1: Check releases
    releaseSpinner = ora("Checking for releases...").start();
    release = await getLatestRelease(owner, repo);
    releaseSpinner.stop();
  } catch (err) {
    if (opts.type === "go-package") {
      console.log(
        chalk.yellow(
          "Could not reach GitHub API; falling back to Go module proxy for go-package.",
        ),
      );
    } else {
      throw err;
    }
  }

  if (opts.type) {
    return await dispatchGithubRepoType(repoInfo, release, opts);
  }

  if (release) {
    releaseSpinner.succeed(
      `Latest release: ${chalk.bold(release.tagName)} (${release.assets.length} assets)`,
    );

    const appAssets = release.assets.filter((a) => isAppAsset(a.name));
    const binAssets = release.assets.filter(
      (a) => isBinaryAsset(a.name) && matchAssetToArch(a.name),
    );

    if (appAssets.length > 0 && binAssets.length > 0) {
      console.log();
      console.log(
        `  Found ${chalk.cyan(appAssets.length)} app asset(s) and ${chalk.cyan(binAssets.length)} binary asset(s)`,
      );

      const choice = await select({
        message:
          "This release has both app bundles and CLI binaries. Which should we use?",
        choices: [
          {
            name: `macOS App Cask (${appAssets.map((a) => a.name).join(", ")})`,
            value: "cask",
          },
          {
            name: `CLI Binary Formula (${binAssets.map((a) => a.name).join(", ")})`,
            value: "binary",
          },
        ],
      });

      if (choice === "cask") {
        return await generateWithConfirmation(
          "cask-app-release",
          { repoInfo, release },
          opts,
        );
      } else {
        return await generateWithConfirmation(
          "binary-release",
          { repoInfo, release },
          opts,
        );
      }
    }

    if (appAssets.length > 0) {
      console.log(
        `  Detected ${chalk.cyan("macOS app")} assets: ${appAssets.map((a) => a.name).join(", ")}`,
      );
      return await generateWithConfirmation(
        "cask-app-release",
        { repoInfo, release },
        opts,
      );
    }

    if (binAssets.length > 0) {
      console.log(
        `  Detected ${chalk.cyan("binary")} assets: ${binAssets.map((a) => a.name).join(", ")}`,
      );
      return await generateWithConfirmation(
        "binary-release",
        { repoInfo, release },
        opts,
      );
    }

    console.log(
      chalk.dim("  No recognized binary or app assets, checking README..."),
    );
  } else {
    releaseSpinner.info("No releases found, checking README...");
  }

  // Step 2: Fetch and analyze README
  const readmeSpinner = ora("Fetching README...").start();
  const readme = await getReadme(owner, repo);
  let serviceConfigFromReadme = null;

  if (!readme) {
    readmeSpinner.warn("No README found");
  } else {
    readmeSpinner.succeed("README fetched");

    // Check for existing Homebrew availability first
    const brewInfo = detectBrewInstall(readme);
    if (brewInfo) {
      console.log();
      console.log(
        chalk.yellow.bold(
          "  This package appears to be available via Homebrew!",
        ),
      );
      console.log(`  Detected command: ${chalk.cyan(brewInfo.installCommand)}`);
      console.log();

      const choice = await select({
        message: "What would you like to do?",
        choices: [
          {
            name: `Run "${brewInfo.installCommand}" directly`,
            value: "brew-install",
          },
          { name: "Generate a custom formula anyway", value: "continue" },
        ],
      });

      if (choice === "brew-install") {
        console.log();
        const installSpinner = ora(
          `Running: ${brewInfo.installCommand}`,
        ).start();
        try {
          const parts = brewInfo.installCommand.split(/\s*&&\s*/);
          const segments = parts
            .map((cmd) => cmd.trim().split(/\s+/).filter(Boolean))
            .filter((args) => args.length > 0);

          for (const args of segments) {
            if (args[0] !== "brew") {
              installSpinner.fail(
                `Refusing to run non-brew command: ${args[0]}`,
              );
              process.exit(1);
            }
          }

          for (const args of segments) {
            await execFileAsync(args[0], args.slice(1));
          }
          installSpinner.succeed("Installation complete!");
          return { type: "brew-install", command: brewInfo.installCommand };
        } catch (err) {
          installSpinner.fail(`Installation failed: ${err.message}`);
          process.exit(1);
        }
      }
    }

    // Detect install method and service hints from README
    const method = detectInstallMethod(readme);
    serviceConfigFromReadme = detectServiceConfig(
      readme,
      opts.name || method?.package || repoInfo.name,
    );

    if (method) {
      console.log(
        `  Detected install method: ${chalk.cyan(method.method)}${method.package ? ` (${method.package})` : ""}`,
      );
    }

    if (serviceConfigFromReadme) {
      console.log(
        `  Detected service/launchagent hint${serviceConfigFromReadme.confidence ? ` (${serviceConfigFromReadme.confidence} confidence)` : ""}`,
      );
    }

    if (method) {
      switch (method.method) {
        case "npm":
          return await generateWithConfirmation(
            "npm-package",
            {
              packageName: opts.package || method.package,
              repoInfo,
              serviceConfig: serviceConfigFromReadme,
            },
            opts,
          );
        case "pip":
          return await generateWithConfirmation(
            "pip-package",
            {
              packageName: opts.package || method.package,
              repoInfo,
              serviceConfig: serviceConfigFromReadme,
            },
            opts,
          );
        case "cargo":
          return await generateWithConfirmation(
            "cargo-package",
            {
              repoInfo,
              release,
              crateName: opts.crateName || method.package,
              serviceConfig: serviceConfigFromReadme,
            },
            opts,
          );
        case "go":
          return await generateWithConfirmation(
            "go-package",
            {
              repoInfo,
              release,
              goModule: opts.goModule || method.package,
              serviceConfig: serviceConfigFromReadme,
            },
            opts,
          );
        case "build":
          return await generateWithConfirmation(
            "source-build",
            {
              repoInfo,
              release,
              buildSystem: method,
              serviceConfig: serviceConfigFromReadme,
            },
            opts,
          );
        case "deno":
        case "swift":
          console.log(
            chalk.dim(
              `  ${method.method} install hints will be used for service detection; continuing with repository analysis for formula generation`,
            ),
          );
          break;
      }
    }
  }

  // Step 3: Detect from repo files
  const filesSpinner = ora("Inspecting repository files...").start();
  const files = await getRepoContents(owner, repo);
  const fileNames = files.map((f) => f.name);
  filesSpinner.succeed(`Found ${files.length} root files`);

  const serviceConfigFromFiles = detectServiceConfigFromFiles(
    fileNames,
    opts.name || repoInfo.name,
  );
  if (serviceConfigFromFiles) {
    console.log(
      `  Detected service/launchagent files${serviceConfigFromFiles.confidence ? ` (${serviceConfigFromFiles.confidence} confidence)` : ""}`,
    );
  }

  const serviceConfig = serviceConfigFromReadme || serviceConfigFromFiles;

  const buildSystem = detectBuildSystemFromFiles(fileNames);
  if (buildSystem) {
    console.log(
      `  Detected build system: ${chalk.cyan(buildSystem.method)}${buildSystem.system ? ` (${buildSystem.system})` : ""}`,
    );

    switch (buildSystem.method) {
      case "npm": {
        const pkgJson = await getFileContent(owner, repo, "package.json");
        let packageName = repoInfo.name;
        if (pkgJson) {
          try {
            const pkg = JSON.parse(pkgJson);
            packageName = pkg.name || packageName;
          } catch {
            /* use repo name */
          }
        }
        return await generateWithConfirmation(
          "npm-package",
          { packageName: opts.package || packageName, repoInfo, serviceConfig },
          opts,
        );
      }
      case "pip":
        return await generateWithConfirmation(
          "pip-package",
          {
            packageName: opts.package || repoInfo.name,
            repoInfo,
            serviceConfig,
          },
          opts,
        );
      case "cargo": {
        const cargoToml = await getFileContent(owner, repo, "Cargo.toml");
        const crateName = parseCargoPackageName(cargoToml) || repoInfo.name;
        return await generateWithConfirmation(
          "cargo-package",
          { repoInfo, release, crateName: opts.crateName || crateName, serviceConfig },
          opts,
        );
      }
      case "go":
        return await generateWithConfirmation(
          "go-package",
          { repoInfo, release, serviceConfig },
          opts,
        );
      case "build":
        return await generateWithConfirmation(
          "source-build",
          {
            repoInfo,
            release,
            buildSystem,
            serviceConfig,
          },
          opts,
        );
    }
  }

  // Fallback: build from source with make
  console.log(
    chalk.dim(
      "  No specific build system detected, defaulting to source-build",
    ),
  );
  return await generateWithConfirmation(
    "source-build",
    {
      repoInfo,
      release,
      buildSystem: { system: "make" },
      serviceConfig,
    },
    opts,
  );
}

async function handleBashScript(url, opts) {
  return await generateWithConfirmation("install-script", { url }, opts);
}

async function handleNpmPackage(classification, opts) {
  const packageName = opts.package || classification.packageName;
  if (!packageName) {
    throw new Error("npm package name required (use --package or an npmjs URL)");
  }
  return await generateWithConfirmation(
    "npm-package",
    { packageName, repoInfo: null },
    opts,
  );
}

async function handlePipPackage(classification, opts) {
  const packageName = opts.package || classification.packageName;
  if (!packageName) {
    throw new Error("PyPI package name required (use --package or a pypi URL)");
  }
  return await generateWithConfirmation(
    "pip-package",
    { packageName, repoInfo: null },
    opts,
  );
}

async function handleGemPackage(classification, opts) {
  const gemName = opts.gemName || classification.gemName;
  if (!gemName) {
    throw new Error("Ruby gem name required (use --gem-name or a rubygems URL)");
  }
  return await generateWithConfirmation(
    "gem-package",
    { gemName, repoInfo: null },
    opts,
  );
}

async function handleDotnetPackage(classification, opts) {
  const packageName = opts.package || classification.packageName;
  if (!packageName) {
    throw new Error("NuGet package name required (use --package or a nuget URL)");
  }
  return await generateWithConfirmation(
    "dotnet-package",
    { packageName, repoInfo: null },
    opts,
  );
}

async function handleCaskDmg(url, opts) {
  return await generateWithConfirmation("cask-app", { url }, opts);
}

async function handleArchive(url: string, opts: any) {
  const spinner = ora("Downloading and inspecting archive...").start();
  const archiveInfo: any = await inspectArchive(url);
  spinner.succeed(`Archive type: ${chalk.bold(archiveInfo.type)}`);
  const archiveServiceConfig = detectServiceConfigFromFiles(
    archiveInfo.files,
    opts.name || "",
  );
  if (archiveServiceConfig) {
    console.log(
      `  Detected service/launchagent files${archiveServiceConfig.confidence ? ` (${archiveServiceConfig.confidence} confidence)` : ""}`,
    );
  }

  switch (archiveInfo.type) {
    case "app":
      console.log(`  Found app bundle: ${chalk.cyan(archiveInfo.appName)}`);
      return await generateWithConfirmation(
        "cask-app",
        {
          url,
          appName: opts.appName || archiveInfo.appName,
        },
        opts,
      );

    case "source":
      console.log("  Contains source code with build markers");
      return await generateWithConfirmation(
        "archive-build",
        { archiveInfo, serviceConfig: archiveServiceConfig },
        opts,
      );

    case "binary": {
      console.log(
        `  Found ${chalk.cyan(archiveInfo.binaries.length)} executable(s): ${archiveInfo.binaries.map((b) => b.split("/").pop()).join(", ")}`,
      );

      let selected = archiveInfo.binaries;
      if (archiveInfo.binaries.length > 1) {
        selected = await checkbox({
          message: "Select which binaries to install:",
          choices: archiveInfo.binaries.map((b) => ({
            name: b.split("/").pop(),
            value: b,
            checked: true,
          })),
        });
      }
      return await generateWithConfirmation(
        "binary-direct",
        {
          archiveInfo,
          selectedBinaries: selected,
          serviceConfig: archiveServiceConfig,
        },
        opts,
      );
    }

    default:
      console.log(chalk.yellow("  Could not determine archive contents"));
      const choice = await select({
        message: "How should this archive be treated?",
        choices: [
          { name: "Source code (build from source)", value: "source" },
          { name: "Pre-built binary", value: "binary" },
          { name: "macOS app bundle", value: "app" },
        ],
      });

      if (choice === "source") {
        return await generateWithConfirmation(
          "archive-build",
          { archiveInfo, serviceConfig: archiveServiceConfig },
          opts,
        );
      } else if (choice === "binary") {
        archiveInfo.binaries = archiveInfo.files;
        return await generateWithConfirmation(
          "binary-direct",
          { archiveInfo, serviceConfig: archiveServiceConfig },
          opts,
        );
      } else {
        return await generateWithConfirmation("cask-app", { url }, opts);
      }
  }
}

async function handleMacAppStore(url, opts) {
  return await generateWithConfirmation("cask-app-mas", { url }, opts);
}

async function handleSetappApp(url, opts) {
  const { ensureSetappPrerequisites } = await import("./setapp-bootstrap.ts");
  await ensureSetappPrerequisites(opts.tapPath);
  return await generateWithConfirmation("cask-app-setapp", { url }, opts);
}

async function generateWithConfirmation(generatorName, params: any, opts: any) {
  console.log();

  const userOpts: any = {};
  if (!opts.name) {
    const defaultName = guessName(generatorName, params);
    const name = await input({
      message: "Formula/cask name:",
      default: defaultName,
    });
    userOpts.name = name;
  } else {
    userOpts.name = opts.name;
  }

  if (!opts.desc) {
    const defaultDesc = guessDesc(generatorName, params);
    const desc = await input({
      message: "Description:",
      default: defaultDesc,
    });
    userOpts.desc = desc;
  } else {
    userOpts.desc = opts.desc;
  }

  if (isFormulaGenerator(generatorName)) {
    Object.assign(
      userOpts,
      await collectServiceOptions(params, opts, userOpts.name),
    );
  }

  const mergedOpts = { ...opts, ...userOpts };

  console.log();
  const spinner = ora("Generating formula...").start();

  let result;
  switch (generatorName) {
    case "binary-release": {
      const { generateBinaryRelease } =
        await import("./generators/binary-release.ts");
      result = await generateBinaryRelease(
        params.repoInfo,
        params.release,
        mergedOpts,
      );
      break;
    }
    case "source-build": {
      const { generateSourceBuild } =
        await import("./generators/source-build.ts");
      result = await generateSourceBuild(
        params.repoInfo,
        params.release,
        params.buildSystem,
        mergedOpts,
      );
      break;
    }
    case "npm-package": {
      const { generateNpmPackage } =
        await import("./generators/npm-package.ts");
      result = await generateNpmPackage(
        params.packageName,
        params.repoInfo,
        mergedOpts,
      );
      break;
    }
    case "pip-package": {
      const { generatePipPackage } =
        await import("./generators/pip-package.ts");
      result = await generatePipPackage(
        params.packageName,
        params.repoInfo,
        mergedOpts,
      );
      break;
    }
    case "cargo-package": {
      const { generateCargoPackage } =
        await import("./generators/cargo-package.ts");
      result = await generateCargoPackage(params.repoInfo, params.release, {
        ...mergedOpts,
        crateName: params.crateName || mergedOpts.crateName,
      });
      break;
    }
    case "go-package": {
      const { generateGoPackage } = await import("./generators/go-package.ts");
      result = await generateGoPackage(params.repoInfo, params.release, {
        ...mergedOpts,
        goModule: params.goModule || mergedOpts.goModule,
      });
      break;
    }
    case "install-script": {
      const { generateInstallScript } =
        await import("./generators/install-script.ts");
      result = await generateInstallScript(params.url, mergedOpts);
      break;
    }
    case "archive-build": {
      const { generateArchiveBuild } =
        await import("./generators/archive-build.ts");
      result = await generateArchiveBuild(params.archiveInfo, mergedOpts);
      break;
    }
    case "binary-direct": {
      const { generateBinaryDirect } = await import("./generators/binary-direct.ts");
      result = await generateBinaryDirect(
        params.archiveInfo,
        params.selectedBinaries,
        mergedOpts,
      );
      break;
    }
    case "cask-app": {
      const { generateCaskApp } = await import("./generators/cask-app.ts");
      result = await generateCaskApp(params.url, {
        ...mergedOpts,
        appName: params.appName || mergedOpts.appName,
      });
      break;
    }
    case "cask-app-release": {
      const { generateCaskAppRelease } =
        await import("./generators/cask-app-release.ts");
      result = await generateCaskAppRelease(
        params.repoInfo,
        params.release,
        mergedOpts,
      );
      break;
    }
    case "cask-app-mas": {
      const { generateCaskAppMas } = await import("./generators/cask-app-mas.ts");
      result = await generateCaskAppMas(params.url, mergedOpts);
      break;
    }
    case "cask-app-setapp": {
      const { generateCaskAppSetapp } = await import("./generators/cask-app-setapp.ts");
      result = await generateCaskAppSetapp(params.url, mergedOpts);
      break;
    }
    case "spm-package": {
      const { generateSpmPackage } =
        await import("./generators/spm-package.ts");
      result = await generateSpmPackage(
        params.repoInfo,
        params.release,
        mergedOpts,
      );
      break;
    }
    case "dotnet-package": {
      const { generateDotnetPackage } =
        await import("./generators/dotnet-package.ts");
      result = await generateDotnetPackage(
        params.packageName,
        params.repoInfo,
        mergedOpts,
      );
      break;
    }
    case "gem-package": {
      const { generateGemPackage } =
        await import("./generators/gem-package.ts");
      result = await generateGemPackage(
        params.gemName,
        params.repoInfo,
        mergedOpts,
      );
      break;
    }
    case "mint-package": {
      const { generateMintPackage } =
        await import("./generators/mint-package.ts");
      result = await generateMintPackage(
        params.repoInfo,
        params.release,
        mergedOpts,
      );
      break;
    }
    default:
      spinner.fail(`Unknown generator: ${generatorName}`);
      process.exit(1);
  }

  spinner.succeed(`Generated: ${chalk.green(result.filePath)}`);

  await saveManifest(
    buildManifest({
      generatorName: generatorName as GeneratorName,
      params,
      opts: mergedOpts,
      result,
    }),
  );

  try {
    await commitAndPushTap(
      mergedOpts.tapPath,
      [result.filePath],
      `chore(allbrew): add ${result.name}`,
    );
  } catch (err: any) {
    // Tap may not be a git repo or lack a remote; install below still works.
    // But don't silently swallow push failures — warn the user.
    const chalk = (await import("chalk")).default;
    console.warn(
      chalk.yellow(
        `Warning: tap commit/push failed: ${err?.message || err}. ` +
          `The formula was written but may not be pushed to the remote tap.`,
      ),
    );
  }

  await brewAutoInstall(result, mergedOpts);

  return result;
}

async function brewAutoInstall(result: any, opts: any) {
  const isCask = result.type === "cask";
  const installFlag = isCask ? "--cask" : "--formula";
  const installLabel = isCask
    ? `brew install --cask ${result.name}`
    : `brew install ${result.name}`;

  console.log();

  // Step 1: brew update so the tap index reflects the new file
  const updateSpinner = ora("Running brew update...").start();
  try {
    await execFileAsync("brew", ["update"]);
    updateSpinner.succeed("brew update complete");
  } catch (err: any) {
    updateSpinner.warn(`brew update failed: ${err.message}`);
  }

  // Step 2: brew install
  const installEnv = {
    ...process.env,
    HOMEBREW_DEVELOPER: "1",
    HOMEBREW_NO_AUTO_UPDATE: "1",
  };
  const installSpinner = ora(`Running ${installLabel}...`).start();
  try {
    await execFileAsync(
      "brew",
      ["install", installFlag, result.filePath],
      { env: installEnv },
    );
    installSpinner.succeed(`Installed: ${chalk.green(result.name)}`);

    if (!isCask && opts.serviceConfig && opts.service !== false) {
      console.log(
        chalk.dim(`  Start service with: brew services start ${result.name}`),
      );
    }
  } catch (err: any) {
    installSpinner.fail(`brew install failed: ${err.message}`);
    console.log(
      chalk.dim(`  Retry manually: ${installLabel}`),
    );
  }

  console.log(chalk.dim(`  (written to tap at: ${opts.tapPath})`));
  console.log();
}

function isFormulaGenerator(generatorName: string) {
  return [
    "binary-release",
    "source-build",
    "npm-package",
    "pip-package",
    "cargo-package",
    "go-package",
    "install-script",
    "archive-build",
    "binary-direct",
    "spm-package",
    "dotnet-package",
    "gem-package",
    "mint-package",
  ].includes(generatorName);
}

async function collectServiceOptions(params: any, opts: any, formulaName: any) {
  if (opts.service === false) return { service: false };

  if (opts.service || opts.serviceCommand) {
    const command =
      opts.serviceCommand || params.serviceConfig?.command || formulaName;
    return {
      serviceConfig: {
        ...params.serviceConfig,
        command,
        keepAlive: opts.serviceKeepAlive !== false,
      },
    };
  }

  const detected = params.serviceConfig || null;
  const includeService = await confirm({
    message: detected
      ? "Detected service/launchagent hints. Include a Homebrew service block?"
      : "Include a Homebrew service block for brew services?",
    default: Boolean(detected),
  });

  if (!includeService) return { service: false };

  const command = await input({
    message: "Service run command:",
    default: detected?.command || formulaName,
  });

  const keepAlive = await confirm({
    message: "Restart the service if it exits?",
    default: detected?.keepAlive !== false,
  });

  return {
    serviceConfig: {
      ...detected,
      command,
      keepAlive,
    },
  };
}

function parseCargoPackageName(cargoToml: string | null) {
  if (!cargoToml) return null;

  let inPackageSection = false;
  for (const line of cargoToml.split(/\r?\n/)) {
    const trimmed = line.trim();
    const section = trimmed.match(/^\[([^\]]+)\]/);
    if (section) {
      inPackageSection = section[1] === "package";
      continue;
    }

    if (!inPackageSection) continue;
    const name = trimmed.match(/^name\s*=\s*["']([^"']+)["']/);
    if (name) return name[1];
  }

  return null;
}

function guessName(generatorName: any, params: any) {
  if (params.slug) return String(params.slug).toLowerCase();
  if (params.repoInfo) return params.repoInfo.name.toLowerCase();
  if (params.packageName)
    return params.packageName
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/\//, "-");
  if (params.url) {
    const filename = params.url.split("/").pop().split("?")[0];
    return filename
      .replace(/\.(sh|bash|tar\.gz|tgz|zip|dmg|pkg)$/i, "")
      .toLowerCase();
  }
  return "my-package";
}

function guessDesc(generatorName: any, params: any) {
  if (params.repoInfo?.description) return params.repoInfo.description;
  if (params.archiveInfo?.downloadUrl)
    return `Install from ${params.archiveInfo.downloadUrl}`;
  if (params.url) return `Install from ${params.url}`;
  return "";
}
