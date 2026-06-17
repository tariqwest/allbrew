import { select, input, confirm, checkbox } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import { classify, classifyWithHead } from "./classifier.js";
import {
  initOctokit,
  getRepoInfo,
  getLatestRelease,
  getReadme,
  getRepoContents,
  getFileContent,
} from "./github.js";
import {
  detectBrewInstall,
  detectInstallMethod,
  detectBuildSystemFromFiles,
  detectServiceConfig,
  detectServiceConfigFromFiles,
} from "./analyzer.js";
import { inspectArchive } from "./archive-inspector.js";
import { matchAssetToArch, isAppAsset, isBinaryAsset } from "./utils.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function run(url, opts = {}) {
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
        classification.type = choice;
        return await run(url, opts);
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
        value: "github-release-cask",
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
        name: "Build from source — cmake / make / autotools / meson",
        value: "build-from-source",
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

    case "github-release-cask":
      return await generateWithConfirmation(
        "github-release-cask",
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

    case "cargo-package":
      return await generateWithConfirmation(
        "cargo-package",
        { repoInfo, release },
        opts,
      );

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

    case "build-from-source": {
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
        "build-from-source",
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

async function handleArchiveManual(url, opts) {
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
  const archiveInfo = await inspectArchive(url);
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
      "source-archive",
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
        "raw-binary",
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
      "raw-binary",
      {
        archiveInfo,
        selectedBinaries: selected,
        serviceConfig: archiveServiceConfig,
      },
      opts,
    );
  }
}

async function handleGithubRepo(classification, opts) {
  const { owner, repo } = classification;
  const spinner = ora("Fetching repository info...").start();

  const repoInfo = await getRepoInfo(owner, repo);
  spinner.succeed(
    `Repository: ${chalk.bold(repoInfo.fullName)} - ${repoInfo.description || "No description"}`,
  );

  if (repoInfo.license) {
    console.log(`  License: ${chalk.dim(repoInfo.license)}`);
  }

  // Step 1: Check releases
  const releaseSpinner = ora("Checking for releases...").start();
  const release = await getLatestRelease(owner, repo);

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
          "github-release-cask",
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
        "github-release-cask",
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
          for (const cmd of parts) {
            const args = cmd.trim().split(/\s+/);
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
              packageName: method.package,
              repoInfo,
              serviceConfig: serviceConfigFromReadme,
            },
            opts,
          );
        case "pip":
          return await generateWithConfirmation(
            "pip-package",
            {
              packageName: method.package,
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
              goModule: method.package,
              serviceConfig: serviceConfigFromReadme,
            },
            opts,
          );
        case "build":
          return await generateWithConfirmation(
            "build-from-source",
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
          { packageName, repoInfo, serviceConfig },
          opts,
        );
      }
      case "pip":
        return await generateWithConfirmation(
          "pip-package",
          {
            packageName: repoInfo.name,
            repoInfo,
            serviceConfig,
          },
          opts,
        );
      case "cargo":
        return await generateWithConfirmation(
          "cargo-package",
          { repoInfo, release, serviceConfig },
          opts,
        );
      case "go":
        return await generateWithConfirmation(
          "go-package",
          { repoInfo, release, serviceConfig },
          opts,
        );
      case "build":
        return await generateWithConfirmation(
          "build-from-source",
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
      "  No specific build system detected, defaulting to build-from-source",
    ),
  );
  return await generateWithConfirmation(
    "build-from-source",
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
  return await generateWithConfirmation("script-install", { url }, opts);
}

async function handleCaskDmg(url, opts) {
  return await generateWithConfirmation("cask-app", { url }, opts);
}

async function handleArchive(url, opts) {
  const spinner = ora("Downloading and inspecting archive...").start();
  const archiveInfo = await inspectArchive(url);
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
          appName: archiveInfo.appName,
        },
        opts,
      );

    case "source":
      console.log("  Contains source code with build markers");
      return await generateWithConfirmation(
        "source-archive",
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
        "raw-binary",
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
          "source-archive",
          { archiveInfo, serviceConfig: archiveServiceConfig },
          opts,
        );
      } else if (choice === "binary") {
        archiveInfo.binaries = archiveInfo.files;
        return await generateWithConfirmation(
          "raw-binary",
          { archiveInfo, serviceConfig: archiveServiceConfig },
          opts,
        );
      } else {
        return await generateWithConfirmation("cask-app", { url }, opts);
      }
  }
}

async function handleMacAppStore(url, opts) {
  return await generateWithConfirmation("mas-app", { url }, opts);
}

async function generateWithConfirmation(generatorName, params, opts) {
  console.log();

  const userOpts = {};
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
        await import("./generators/binary-release.js");
      result = await generateBinaryRelease(
        params.repoInfo,
        params.release,
        mergedOpts,
      );
      break;
    }
    case "build-from-source": {
      const { generateBuildFromSource } =
        await import("./generators/build-from-source.js");
      result = await generateBuildFromSource(
        params.repoInfo,
        params.release,
        params.buildSystem,
        mergedOpts,
      );
      break;
    }
    case "npm-package": {
      const { generateNpmPackage } =
        await import("./generators/npm-package.js");
      result = await generateNpmPackage(
        params.packageName,
        params.repoInfo,
        mergedOpts,
      );
      break;
    }
    case "pip-package": {
      const { generatePipPackage } =
        await import("./generators/pip-package.js");
      result = await generatePipPackage(
        params.packageName,
        params.repoInfo,
        mergedOpts,
      );
      break;
    }
    case "cargo-package": {
      const { generateCargoPackage } =
        await import("./generators/cargo-package.js");
      result = await generateCargoPackage(
        params.repoInfo,
        params.release,
        mergedOpts,
      );
      break;
    }
    case "go-package": {
      const { generateGoPackage } = await import("./generators/go-package.js");
      result = await generateGoPackage(params.repoInfo, params.release, {
        ...mergedOpts,
        goModule: params.goModule,
      });
      break;
    }
    case "script-install": {
      const { generateScriptInstall } =
        await import("./generators/script-install.js");
      result = await generateScriptInstall(params.url, mergedOpts);
      break;
    }
    case "source-archive": {
      const { generateSourceArchive } =
        await import("./generators/source-archive.js");
      result = await generateSourceArchive(params.archiveInfo, mergedOpts);
      break;
    }
    case "raw-binary": {
      const { generateRawBinary } = await import("./generators/raw-binary.js");
      result = await generateRawBinary(
        params.archiveInfo,
        params.selectedBinaries,
        mergedOpts,
      );
      break;
    }
    case "cask-app": {
      const { generateCaskApp } = await import("./generators/cask-app.js");
      result = await generateCaskApp(params.url, {
        ...mergedOpts,
        appName: params.appName,
      });
      break;
    }
    case "github-release-cask": {
      const { generateGithubReleaseCask } =
        await import("./generators/github-release-cask.js");
      result = await generateGithubReleaseCask(
        params.repoInfo,
        params.release,
        mergedOpts,
      );
      break;
    }
    case "mas-app": {
      const { generateMasApp } = await import("./generators/mas-app.js");
      result = await generateMasApp(params.url, mergedOpts);
      break;
    }
    default:
      spinner.fail(`Unknown generator: ${generatorName}`);
      process.exit(1);
  }

  spinner.succeed(`Generated: ${chalk.green(result.filePath)}`);
  console.log();

  if (result.type === "formula") {
    console.log(chalk.dim(`  Install with: brew install ${result.name}`));
    if (mergedOpts.serviceConfig && mergedOpts.service !== false) {
      console.log(
        chalk.dim(`  Start service with: brew services start ${result.name}`),
      );
    }
  } else {
    console.log(
      chalk.dim(`  Install with: brew install --cask ${result.name}`),
    );
  }
  console.log(chalk.dim(`  (written to tap at: ${mergedOpts.tapPath})`));
  console.log();

  return result;
}

function isFormulaGenerator(generatorName) {
  return [
    "binary-release",
    "build-from-source",
    "npm-package",
    "pip-package",
    "cargo-package",
    "go-package",
    "script-install",
    "source-archive",
    "raw-binary",
  ].includes(generatorName);
}

async function collectServiceOptions(params, opts, formulaName) {
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

function guessName(generatorName, params) {
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

function guessDesc(generatorName, params) {
  if (params.repoInfo?.description) return params.repoInfo.description;
  if (params.archiveInfo?.downloadUrl)
    return `Install from ${params.archiveInfo.downloadUrl}`;
  if (params.url) return `Install from ${params.url}`;
  return "";
}
