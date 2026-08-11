import { select, input, confirm, checkbox } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import { classifyWithHead } from "./classifier.ts";
import {
  discoverPageDownloads,
  findStoreDownloadGate,
  parseDiscoverMode,
  type DiscoverCandidate,
} from "./page-discover.ts";
import {
  initOctokit,
  getRepoInfo,
  getLatestRelease,
  listReleases,
  pickReleaseWithAppAssets,
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
import {
  matchAssetToArch,
  isAppAsset,
  isBinaryAsset,
  chooseReleaseArtifactKind,
  resolveNonCollidingFormulaName,
  resolveNonCollidingCaskName,
  toFormulaName,
  toCaskToken,
} from "./utils.ts";
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
    if (classification.type === "unknown") {
      // Case C: product homepage already shipped on homebrew/cask with matching
      // homepage domain → adopt official cask (avoid MAS storefront / *-tap).
      try {
        const { matchOfficialCaskByHomepage } = await import(
          "./generators/homebrew-cask.ts"
        );
        const matched = await matchOfficialCaskByHomepage(url, opts.name);
        if (matched?.token) {
          classification = {
            type: "homebrew-cask",
            url: `https://formulae.brew.sh/cask/${matched.token}`,
            name: matched.token,
          };
          opts = {
            ...opts,
            // Official cask token wins over batch --name slugs (refine-app → refine).
            name: matched.token,
            sourceUrl: url,
            discoverMethod: "homebrew-cask-homepage",
          };
          console.log(
            `  Matched official homebrew/cask ${chalk.bold(matched.token)} via homepage domain`,
          );
        }
      } catch {
        /* optional path */
      }

      if (classification.type === "unknown") {
        const discovered = await maybeDiscoverFromUnknownPage(url, opts);
        if (discovered) {
          classification = discovered.classification;
          opts = {
            ...opts,
            sourceUrl: url,
            resolvedUrl: discovered.resolvedUrl,
            discoverMethod: discovered.method,
          };
          console.log(
            `  Resolved download via discovery (${chalk.cyan(discovered.method)}): ${chalk.bold(classification.type)} → ${chalk.cyan(discovered.resolvedUrl)}`,
          );
        }
      }
    }

    return await dispatchClassification(classification, opts);
  } catch (err) {
    console.error(chalk.red(`\nError: ${err.message}`));
    if (opts.verbose) console.error(err.stack);
    process.exit(1);
  }
}

async function dispatchClassification(classification: any, opts: any) {
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
    case "cargo-package":
      return await handleCargoPackage(classification, opts);
    case "homebrew-formula":
      return await handleHomebrewFormula(classification, opts);
    case "homebrew-cask":
      return await handleHomebrewCask(classification, opts);
    default:
      if (isNonInteractive(opts)) {
        throw new Error(
          `Unable to automatically handle URL (non-interactive): ${classification.url}`,
        );
      }
      return await promptUnknownUrl(
        classification.url,
        opts,
        (opts._discoveredCandidates as DiscoverCandidate[]) || [],
      );
  }
}

function isNonInteractive(opts: any = {}): boolean {
  if (opts.yes || opts.nonInteractive || opts.noninteractive) return true;
  if (process.env.ALLBREW_NONINTERACTIVE === "1") return true;
  if (process.env.CI === "true" || process.env.CI === "1") return true;
  return !process.stdin.isTTY || !process.stdout.isTTY;
}

async function maybeDiscoverFromUnknownPage(url: string, opts: any) {
  const mode = parseDiscoverMode(
    opts.discover === undefined ? (opts.noDiscover ? "off" : "auto") : opts.discover,
  );
  if (mode === "off") return null;

  // Skip discovery for obvious non-page inputs (already handled by classify usually).
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (/\.(dmg|pkg|zip|tgz|tar\.gz|tar\.bz2|tar\.xz|sh|bash)(\?|$)/i.test(path)) {
      return null;
    }
  } catch {
    return null;
  }

  const spinner = ora("Discovering downloads on page...").start();
  try {
    const result = await discoverPageDownloads(url, {
      mode,
      verbose: Boolean(opts.verbose),
      nameHint: typeof opts.name === "string" ? opts.name : undefined,
      log: (msg) => {
        if (opts.verbose) console.log(chalk.dim(`  ${msg}`));
      },
    });

    if (result.candidates.length === 0) {
      spinner.info(
        `No download candidates found${result.reason ? ` (${result.reason})` : ""}`,
      );
      return null;
    }

    spinner.succeed(
      `Found ${result.candidates.length} download candidate(s) via ${result.method}`,
    );
    for (const c of result.candidates.slice(0, 5)) {
      console.log(
        chalk.dim(
          `    [${c.score}] ${c.kind} ${c.url}${c.evidence?.length ? ` (${c.evidence.slice(0, 3).join(", ")})` : ""}`,
        ),
      );
    }

    // Keep candidates for the unknown fallback prompt if auto-pick fails.
    opts._discoveredCandidates = result.candidates;

    let chosen: DiscoverCandidate | null = result.chosen;
    if (!chosen) {
      const usable = result.candidates.filter(
        (c) =>
          c.kind !== "store-download-gate" &&
          (c.kind !== "unknown" ||
            /\.(dmg|pkg|zip|tgz|tar\.gz|sh|bash)(?:\?|#|$)/i.test(c.url) ||
            (c.evidence || []).includes("install-command")),
      );
      if (isNonInteractive(opts)) {
        // Never hang automation on ambiguous HTML noise.
        chosen = usable[0] || null;
        if (!chosen) {
          const gate = findStoreDownloadGate(result.candidates);
          if (gate) {
            spinner.warn(
              `Download is behind a store gate (no direct .dmg/.zip URL): ${gate.url}`,
            );
            console.log(
              chalk.dim(
                "  Gumroad/itch-style product pages require checkout before a file URL is issued; allbrew cannot build a cask without a stable direct artifact URL.",
              ),
            );
          } else {
            spinner.warn(
              "No high-confidence download candidate in non-interactive mode",
            );
          }
          return null;
        }
        console.log(
          chalk.dim(
            `  Non-interactive: selecting top usable candidate [${chosen.score}] ${chosen.kind} ${chosen.url}`,
          ),
        );
      } else {
        chosen = await promptDiscoveredCandidates(
          usable.length ? usable : result.candidates,
        );
        if (!chosen) return null;
      }
    }

    let classification = await classifyWithHead(chosen.url);
    if (classification.type === "unknown") {
      // Trust the discovery scoring when it already identified a concrete kind
      // via install-command evidence (e.g. warp agent-cli). This avoids a
      // prompt hang in non-interactive mode when HEAD is misleading.
      if (chosen.kind !== "unknown" && chosen.kind !== "store-download-gate") {
        classification = { type: chosen.kind, url: chosen.url } as any;
        console.log(
          chalk.dim(
            `  Using discovered kind ${chosen.kind} for ${chosen.url} (HEAD was unknown)`,
          ),
        );
      } else {
        console.log(
          chalk.yellow(
            `  Discovered URL still classifies as unknown: ${chosen.url}`,
          ),
        );
        if (isNonInteractive(opts)) {
          console.log(
            chalk.yellow(`  Non-interactive: cannot prompt for unknown URL type`),
          );
          return null;
        }
        await promptUnknownUrl(chosen.url, opts, result.candidates);
        return null;
      }
    }

    return {
      classification,
      resolvedUrl: chosen.url,
      method: result.method,
    };
  } catch (err: any) {
    spinner.warn(`Discovery failed: ${err?.message || err}`);
    return null;
  }
}

async function promptDiscoveredCandidates(
  candidates: DiscoverCandidate[],
): Promise<DiscoverCandidate | null> {
  const top = candidates.slice(0, 8);
  const choice = await select({
    message: "Multiple download candidates found. Which should allbrew use?",
    choices: [
      ...top.map((c, i) => ({
        name: `[${c.score}] ${c.kind} — ${c.url}`,
        value: String(i),
      })),
      { name: "None — fall back to manual type prompt", value: "none" },
    ],
  });
  if (choice === "none") return null;
  return top[Number(choice)] || null;
}

async function promptUnknownUrl(
  url: string,
  opts: any,
  discovered: DiscoverCandidate[],
) {
  console.log(
    chalk.yellow(`\nUnable to automatically determine how to handle this URL.`),
  );

  const choices: { name: string; value: string }[] = [];
  for (const [i, c] of discovered.slice(0, 5).entries()) {
    choices.push({
      name: `Use discovered: [${c.score}] ${c.kind} — ${c.url}`,
      value: `disc:${i}`,
    });
  }
  choices.push(
    { name: "Bash/shell install script", value: "bash-script" },
    { name: "Archive containing source code", value: "archive" },
    { name: "Archive containing a pre-built binary", value: "archive" },
    { name: "DMG or archive containing a macOS .app", value: "cask-dmg" },
    { name: "GitHub repository URL (enter/paste)", value: "github-repo" },
    { name: "npm / PyPI / other registry package page", value: "registry" },
  );

  const choice = await select({
    message: "What type of content does this URL point to?",
    choices,
  });

  if (choice.startsWith("disc:")) {
    const idx = Number(choice.slice(5));
    const c = discovered[idx];
    if (!c) throw new Error("Invalid discovered candidate");
    const classification = await classifyWithHead(c.url);
    opts.sourceUrl = opts.sourceUrl || url;
    opts.resolvedUrl = c.url;
    if (classification.type === "unknown") {
      // Force artifact handlers by extension-ish kind
      if (c.kind === "bash-script") return await handleBashScript(c.url, opts);
      if (c.kind === "cask-dmg") return await handleCaskDmg(c.url, opts);
      if (c.kind === "archive") return await handleArchive(c.url, opts);
      throw new Error(`Still unable to handle discovered URL: ${c.url}`);
    }
    return await dispatchClassification(classification, {
      ...opts,
      sourceUrl: opts.sourceUrl || url,
      resolvedUrl: c.url,
    });
  }

  switch (choice) {
    case "bash-script":
      return await handleBashScript(url, opts);
    case "cask-dmg":
      return await handleCaskDmg(url, opts);
    case "archive":
      return await handleArchive(url, opts);
    case "github-repo": {
      const ghUrl = await input({
        message: "GitHub repository URL:",
        default: url.includes("github.com") ? url : "",
      });
      const classification = await classifyWithHead(ghUrl);
      if (classification.type !== "github-repo") {
        throw new Error(`Not a GitHub repo URL: ${ghUrl}`);
      }
      return await handleGithubRepo(classification, opts);
    }
    case "registry": {
      const regUrl = await input({
        message: "Registry package URL (npm/PyPI/crates/RubyGems/NuGet):",
      });
      const classification = await classifyWithHead(regUrl);
      return await dispatchClassification(classification, opts);
    }
    default:
      throw new Error(`Unhandled choice: ${choice}`);
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
    // Platform-tagged binaries. Homebrew on macOS needs at least one macOS
    // asset; Linux-only releases (e.g. ugm, gpg-tui) must fall through to README
    // install methods (go, cargo, source-build) instead of binary-release.
    const allBinAssets = release.assets.filter(
      (a) => isBinaryAsset(a.name) && matchAssetToArch(a.name),
    );
    const binAssetsRaw = allBinAssets.filter((a) => {
      const arch = matchAssetToArch(a.name);
      return (
        arch === "macosArm" ||
        arch === "macosIntel" ||
        arch === "macosUniversal"
      );
    });
    // Intel-only macOS assets (no arm64/universal) produce formulas with only
    // `on_intel` URLs. On Apple Silicon Homebrew then fails with
    // "formula requires at least a URL". Fall through to README methods
    // (cargo/go/source) so arm64 hosts get a buildable formula (e.g. tickrs).
    const hasMacosArmOrUniversal = binAssetsRaw.some((a) => {
      const arch = matchAssetToArch(a.name);
      return arch === "macosArm" || arch === "macosUniversal";
    });
    const intelOnlyMacosBinAssets =
      binAssetsRaw.length > 0 && !hasMacosArmOrUniversal;
    const binAssets = intelOnlyMacosBinAssets ? [] : binAssetsRaw;
    const linuxOnlyBinAssets =
      binAssetsRaw.length === 0 && allBinAssets.length > 0;
    const intelOnlyMacosSkipped = intelOnlyMacosBinAssets;

    if (appAssets.length > 0 && binAssets.length > 0) {
      console.log();
      console.log(
        `  Found ${chalk.cyan(appAssets.length)} app asset(s) and ${chalk.cyan(binAssets.length)} binary asset(s)`,
      );

      let choice: "cask" | "binary" = "cask";
      if (isNonInteractive(opts)) {
        choice = chooseReleaseArtifactKind(appAssets.length, binAssets.length) || "cask";
        console.log(
          chalk.dim(
            `  Non-interactive: preferring ${choice === "cask" ? "macOS App Cask" : "CLI Binary Formula"}`,
          ),
        );
      } else {
        choice = await select({
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
      }

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
      try {
        return await generateWithConfirmation(
          "cask-app-release",
          { repoInfo, release },
          opts,
        );
      } catch (err: any) {
        if (err?.message?.includes("No .app bundle found")) {
          console.log(
            chalk.dim(
              `  Cask check failed: ${err.message}; trying binary/source strategies...`,
            ),
          );
        } else {
          throw err;
        }
      }
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

    if (linuxOnlyBinAssets) {
      console.log(
        chalk.dim(
          `  Release has Linux-only binary assets (${allBinAssets.map((a) => a.name).join(", ")}); no macOS bottle path — checking older releases / README...`,
        ),
      );
    } else if (intelOnlyMacosSkipped) {
      console.log(
        chalk.dim(
          `  Release has Intel-only macOS binary assets (${binAssetsRaw.map((a) => a.name).join(", ")}); no arm64/universal bottle — checking older releases / README...`,
        ),
      );
    } else {
      console.log(
        chalk.dim(
          "  No recognized binary or app assets on latest release, checking older releases...",
        ),
      );
    }

    // Latest often ships Linux/Windows only (e.g. manuskript 0.17.0) while an
    // older tag still has osx.dmg — walk recent releases before README/source.
    try {
      const recent = await listReleases(owner, repo, { perPage: 30 });
      const olderWithApp = pickReleaseWithAppAssets(recent, isAppAsset);
      if (
        olderWithApp &&
        olderWithApp.tagName &&
        olderWithApp.tagName !== release.tagName
      ) {
        const names = olderWithApp.assets
          .filter((a) => isAppAsset(a.name))
          .map((a) => a.name);
        console.log(
          `  Found macOS app assets on older release ${chalk.bold(olderWithApp.tagName)}: ${names.join(", ")}`,
        );
        return await generateWithConfirmation(
          "cask-app-release",
          { repoInfo, release: olderWithApp },
          opts,
        );
      }
    } catch (err) {
      if (opts.verbose) {
        console.log(
          chalk.dim(
            `  Older-release scan failed: ${err?.message || err}; continuing...`,
          ),
        );
      }
    }
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
    const brewInfo = detectBrewInstall(
      readme,
      opts.package || opts.name || repoInfo.name,
    );
    if (brewInfo) {
      console.log();
      console.log(
        chalk.yellow.bold(
          "  This package appears to be available via Homebrew!",
        ),
      );
      console.log(`  Detected command: ${chalk.cyan(brewInfo.installCommand)}`);
      console.log();

      // Non-interactive/batch: keep generating a formula/cask instead of hanging
      // on select() or auto-running host `brew install` (no tap/manifest).
      let choice: "brew-install" | "continue" = "continue";
      if (isNonInteractive(opts)) {
        console.log(
          chalk.dim(
            `  Non-interactive: generating custom formula anyway (Homebrew also has: ${brewInfo.installCommand})`,
          ),
        );
        choice = "continue";
      } else {
        choice = await select({
          message: "What would you like to do?",
          choices: [
            {
              name: `Run "${brewInfo.installCommand}" directly`,
              value: "brew-install",
            },
            { name: "Generate a custom formula anyway", value: "continue" },
          ],
        });
      }

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
    const method = detectInstallMethod(
      readme,
      opts.package || opts.name || repoInfo.name,
    );
    serviceConfigFromReadme = detectServiceConfig(
      readme,
      opts.name || method?.package || repoInfo.name,
    );

    if (method) {
      const detail =
        method.package ||
        method.url ||
        method.script ||
        method.system ||
        "";
      console.log(
        `  Detected install method: ${chalk.cyan(method.method)}${detail ? ` (${detail})` : ""}`,
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
        case "dotnet":
          console.log(
            chalk.yellow(
              "Note: the dotnet/NuGet generator is experimental and not yet fully verified end-to-end.",
            ),
          );
          return await generateWithConfirmation(
            "dotnet-package",
            {
              packageName: opts.package || method.package,
              repoInfo,
              serviceConfig: serviceConfigFromReadme,
            },
            opts,
          );
        case "gem":
          return await generateWithConfirmation(
            "gem-package",
            {
              gemName: opts.gemName || opts.package || method.package,
              repoInfo,
              serviceConfig: serviceConfigFromReadme,
            },
            opts,
          );
        case "build": {
          // README `make all` often wraps a language package manager. Prefer
          // Cargo.toml / go.mod markers over a non-PREFIX-aware Makefile.
          const cargoTomlForBuild = await getFileContent(
            owner,
            repo,
            "Cargo.toml",
          );
          if (cargoTomlForBuild) {
            const resolved = await resolveCargoGithubInstall(
              owner,
              repo,
              repoInfo,
              cargoTomlForBuild,
              opts,
            );
            console.log(
              chalk.dim(
                `  Preferring cargo over README build (${method.system || "make"}): Cargo.toml present` +
                  (resolved.cargoPath && resolved.cargoPath !== "."
                    ? ` (path ${resolved.cargoPath})`
                    : ""),
              ),
            );
            return await generateWithConfirmation(
              "cargo-package",
              {
                repoInfo,
                release,
                crateName: resolved.crateName,
                cargoPath: resolved.cargoPath,
                serviceConfig: serviceConfigFromReadme,
              },
              opts,
            );
          }
          const goModForBuild = await getFileContent(owner, repo, "go.mod");
          if (goModForBuild) {
            console.log(
              chalk.dim(
                `  Preferring go over README build (${method.system || "make"}): go.mod present`,
              ),
            );
            return await generateWithConfirmation(
              "go-package",
              {
                repoInfo,
                release,
                serviceConfig: serviceConfigFromReadme,
              },
              opts,
            );
          }
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
        }
        case "script": {
          const scriptUrl = resolveScriptInstallUrl(
            method,
            repoInfo,
            owner,
            repo,
          );
          if (scriptUrl) {
            console.log(`  Using install script: ${chalk.cyan(scriptUrl)}`);
            return await generateWithConfirmation(
              "install-script",
              { url: scriptUrl, repoInfo },
              opts,
            );
          }
          console.log(
            chalk.dim(
              "  Script install hint found but no resolvable URL; continuing with repository analysis",
            ),
          );
          break;
        }
        case "deno":
          console.log(
            chalk.dim(
              `  ${method.method} install hints will be used for service detection; continuing with repository analysis for formula generation`,
            ),
          );
          break;
        case "swift": {
          const packageSwiftText = await getFileContent(
            owner,
            repo,
            "Package.swift",
          );
          const rootFilesForSwift = await getRepoContents(owner, repo);
          const rootNamesForSwift = rootFilesForSwift.map((f) => f.name);
          await assertSpmPackageInstallable(
            packageSwiftText,
            rootNamesForSwift,
            repoInfo,
            opts,
          );
          const spmOpts = await resolveSpmBinOptions(
            packageSwiftText,
            repoInfo,
            opts,
          );
          return await generateWithConfirmation(
            "spm-package",
            {
              repoInfo,
              release,
              serviceConfig: serviceConfigFromReadme,
              packageSwiftText: packageSwiftText || "",
            },
            { ...opts, ...spmOpts },
          );
        }
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
      case "script": {
        const scriptUrl = resolveScriptInstallUrl(
          buildSystem,
          repoInfo,
          owner,
          repo,
        );
        if (scriptUrl) {
          console.log(`  Using install script: ${chalk.cyan(scriptUrl)}`);
          return await generateWithConfirmation(
            "install-script",
            { url: scriptUrl, repoInfo },
            opts,
          );
        }
        break;
      }
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
        const resolved = await resolveCargoGithubInstall(
          owner,
          repo,
          repoInfo,
          cargoToml,
          opts,
        );
        return await generateWithConfirmation(
          "cargo-package",
          {
            repoInfo,
            release,
            crateName: resolved.crateName,
            cargoPath: resolved.cargoPath,
            serviceConfig,
          },
          opts,
        );
      }
      case "go":
        return await generateWithConfirmation(
          "go-package",
          { repoInfo, release, serviceConfig },
          opts,
        );
      case "gem":
        return await generateWithConfirmation(
          "gem-package",
          {
            gemName:
              opts.gemName ||
              opts.package ||
              buildSystem.package ||
              repoInfo.name,
            repoInfo,
            serviceConfig,
          },
          opts,
        );
      case "swift": {
        const packageSwiftText = await getFileContent(
          owner,
          repo,
          "Package.swift",
        );
        await assertSpmPackageInstallable(
          packageSwiftText,
          fileNames,
          repoInfo,
          opts,
        );
        const spmOpts = await resolveSpmBinOptions(
          packageSwiftText,
          repoInfo,
          opts,
        );
        return await generateWithConfirmation(
          "spm-package",
          {
            repoInfo,
            release,
            serviceConfig,
            packageSwiftText: packageSwiftText || "",
          },
          { ...opts, ...spmOpts },
        );
      }
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

  // Xcode app / workspace without installable release assets or CLI products.
  {
    const { hasXcodeAppProject } = await import("./generators/spm-package.ts");
    if (hasXcodeAppProject(fileNames)) {
      throw new Error(
        `Repository ${repoInfo.fullName} looks like an Xcode app project ` +
          `(${fileNames.find((f) => /\.(xcodeproj|xcworkspace)$/i.test(String(f)))}) ` +
          `with no recognized macOS app release assets (DMG/ZIP/PKG) and no Homebrew-installable CLI. ` +
          `Install via Xcode, TestFlight, or the Mac App Store — not a generated formula. ` +
          `If a separate CLI repo exists, allbrew that URL instead.`,
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

async function handleHomebrewFormula(classification, opts) {
  return await generateWithConfirmation(
    "homebrew-formula",
    { name: classification.name },
    opts,
  );
}

async function handleHomebrewCask(classification, opts) {
  return await generateWithConfirmation(
    "homebrew-cask",
    { name: classification.name },
    opts,
  );
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
  console.log(
    chalk.yellow(
      "Note: the dotnet/NuGet generator is experimental and not yet fully verified end-to-end.",
    ),
  );
  return await generateWithConfirmation(
    "dotnet-package",
    { packageName, repoInfo: null },
    opts,
  );
}

async function handleCargoPackage(classification, opts) {
  const crateName =
    opts.crateName || opts.package || classification.crateName;
  if (!crateName) {
    throw new Error(
      "crates.io crate name required (use --package or a crates.io URL)",
    );
  }
  return await generateWithConfirmation(
    "cargo-package",
    { repoInfo: null, release: null, crateName },
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
      if (isNonInteractive(opts)) {
        throw new Error(
          `Unable to classify archive contents in non-interactive mode: ${url}`,
        );
      }
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

function isCaskGenerator(generatorName: string) {
  return [
    "cask-app",
    "cask-app-release",
    "cask-app-mas",
    "cask-app-setapp",
    "homebrew-cask",
  ].includes(generatorName);
}

async function generateWithConfirmation(generatorName, params: any, opts: any) {
  console.log();

  const userOpts: any = {};
  if (!opts.name) {
    const defaultName = guessName(generatorName, params);
    if (isNonInteractive(opts)) {
      userOpts.name = defaultName;
    } else {
      const name = await input({
        message: "Formula/cask name:",
        default: defaultName,
      });
      userOpts.name = name;
    }
  } else {
    userOpts.name = opts.name;
  }

  if (isFormulaGenerator(generatorName)) {
    const preferred = toFormulaName(userOpts.name);
    if (generatorName === "homebrew-formula") {
      // Preserve the official homebrew/core token so the copied formula's
      // class name and bottle block stay aligned with the file name.
      userOpts.name = preferred;
    } else {
      const altSources = [
        params.packageName,
        params.crateName,
        params.gemName,
        params.goModule,
        opts.package,
        opts.crateName,
        opts.binName,
        params.repoInfo?.name,
      ];
      const resolved = resolveNonCollidingFormulaName(preferred, altSources);
      if (resolved.renamedFrom && resolved.name !== preferred) {
        console.log(
          chalk.yellow(
            `  Formula name "${preferred}" collides with homebrew/core; using "${resolved.name}" instead`,
          ),
        );
        if (!opts.binName && !userOpts.binName) {
          userOpts.binName = preferred;
        }
        userOpts.name = resolved.name;
      }
    }
  }

  if (isCaskGenerator(generatorName)) {
    const preferred = toCaskToken(userOpts.name);
    if (generatorName === "homebrew-cask") {
      // Preserve the official homebrew/cask token.
      userOpts.name = preferred;
    } else {
      const owner = params.repoInfo?.fullName?.split?.("/")?.[0];
      const altSources = [
        params.repoInfo?.fullName
          ? String(params.repoInfo.fullName).replace("/", "-")
          : null,
        owner && params.repoInfo?.name ? `${params.repoInfo.name}-${owner}` : null,
        owner ? `${preferred}-${owner}` : null,
        opts.appName,
        params.slug,
        params.repoInfo?.name,
      ];
      const resolved = resolveNonCollidingCaskName(preferred, altSources);
      if (resolved.renamedFrom && resolved.name !== preferred) {
        console.log(
          chalk.yellow(
            `  Cask name "${preferred}" collides with homebrew/cask; using "${resolved.name}" instead`,
          ),
        );
        userOpts.name = resolved.name;
      }
    }
  }

  if (!opts.desc) {
    const defaultDesc = guessDesc(generatorName, params);
    if (isNonInteractive(opts)) {
      userOpts.desc = defaultDesc;
    } else {
      const desc = await input({
        message: "Description:",
        default: defaultDesc,
      });
      userOpts.desc = desc;
    }
  } else {
    userOpts.desc = opts.desc;
  }

  if (isFormulaGenerator(generatorName) && generatorName !== "homebrew-formula") {
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
        cargoPath: params.cargoPath || mergedOpts.cargoPath,
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

    case "homebrew-formula": {
      const { generateHomebrewFormula } =
        await import("./generators/homebrew-formula.ts");
      result = await generateHomebrewFormula(userOpts.name, mergedOpts);
      break;
    }

    case "homebrew-cask": {
      const { generateHomebrewCask } =
        await import("./generators/homebrew-cask.ts");
      result = await generateHomebrewCask(userOpts.name, mergedOpts);
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
  const headOnly = !isCask && (await isHeadOnlyFormulaFile(result.filePath));
  const headFlag = headOnly ? ["--HEAD"] : [];
  const installLabel = isCask
    ? `brew install --cask ${result.name}`
    : headOnly
      ? `brew install --HEAD ${result.name}`
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
      ["install", ...headFlag, installFlag, result.filePath],
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
    process.exitCode = 1;
  }

  console.log(chalk.dim(`  (written to tap at: ${opts.tapPath})`));
  console.log();
}

/** True when the formula has a `head` stanza and no stable `url` (HEAD-only). */
async function isHeadOnlyFormulaFile(filePath: string): Promise<boolean> {
  if (!filePath) return false;
  try {
    const { readFile } = await import("node:fs/promises");
    const text = await readFile(filePath, "utf8");
    const hasHead = /^\s*head\s+["']/m.test(text);
    const hasStableUrl = /^\s*url\s+["']/m.test(text);
    return hasHead && !hasStableUrl;
  } catch {
    return false;
  }
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
    "homebrew-formula",
  ].includes(generatorName);
}

function isInteractiveTty() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function collectServiceOptions(params: any, opts: any, formulaName: any) {
  const { isValidServiceCommand } = await import("./generators/service.ts");
  if (opts.service === false) return { service: false };
  if (opts.service || opts.serviceCommand) {
    const command = opts.serviceCommand || params.serviceConfig?.command || formulaName;
    if (!isValidServiceCommand(String(command || ""))) return { service: false };
    return {
      serviceConfig: {
        ...params.serviceConfig,
        command,
        keepAlive: opts.serviceKeepAlive !== false,
      },
    };
  }

  // Non-interactive runs (monitored installs, pipes): auto-detect only — never prompt.
  // Skip low-confidence hints (generic "background process" wording, weak serve cues).
  if (!isInteractiveTty()) {
    const detected = params.serviceConfig;
    if (
      detected?.command &&
      detected.confidence !== "low" &&
      isValidServiceCommand(String(detected.command))
    ) {
      return {
        serviceConfig: {
          ...detected,
          keepAlive: detected.keepAlive !== false,
        },
      };
    }
    return { service: false };
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

async function resolveCargoGithubInstall(
  owner: string,
  repo: string,
  repoInfo: any,
  cargoToml: string | null,
  opts: any,
): Promise<{ crateName: string; cargoPath: string }> {
  const {
    parseCargoPackageName,
    parseCargoWorkspaceMembers,
    isCargoWorkspaceRoot,
  } = await import("./generators/cargo-package.ts");

  const rootName = parseCargoPackageName(cargoToml);
  let crateName =
    opts.crateName || opts.package || rootName || repoInfo?.name || repo;
  let cargoPath = ".";

  if (rootName) {
    return { crateName: opts.crateName || opts.package || rootName, cargoPath };
  }

  if (!isCargoWorkspaceRoot(cargoToml)) {
    return { crateName, cargoPath };
  }

  const members = parseCargoWorkspaceMembers(cargoToml);
  const preferred =
    String(opts.crateName || opts.package || repoInfo?.name || repo || "")
      .toLowerCase()
      .replace(/_/g, "-");

  let fallbackPath: string | null = null;
  let fallbackName: string | null = null;

  for (const member of members) {
    const memberToml = await getFileContent(
      owner,
      repo,
      `${member.replace(/\/$/, "")}/Cargo.toml`,
    );
    const pkgName = parseCargoPackageName(memberToml);
    if (!pkgName) continue;
    const norm = pkgName.toLowerCase().replace(/_/g, "-");
    if (norm === preferred || preferred.endsWith(norm) || norm.endsWith(preferred)) {
      return {
        crateName: opts.crateName || opts.package || pkgName,
        cargoPath: member.replace(/\/$/, ""),
      };
    }
    // Prefer a member whose package name equals the repo slug when scanning.
    if (!fallbackPath && (norm === String(repo).toLowerCase() || norm === String(repoInfo?.name || "").toLowerCase())) {
      fallbackPath = member.replace(/\/$/, "");
      fallbackName = pkgName;
    }
    // Else keep first binary-ish member as last-resort (path with "all-in-one", "cli", "bin")
    if (
      !fallbackPath &&
      /(?:^|\/)(?:cli|bin|app|all-in-one|main)(?:\/|$)/i.test(member)
    ) {
      fallbackPath = member.replace(/\/$/, "");
      fallbackName = pkgName;
    }
  }

  if (fallbackPath) {
    return {
      crateName: opts.crateName || opts.package || fallbackName || crateName,
      cargoPath: fallbackPath,
    };
  }

  // First member with a [package] name
  for (const member of members) {
    const memberToml = await getFileContent(
      owner,
      repo,
      `${member.replace(/\/$/, "")}/Cargo.toml`,
    );
    const pkgName = parseCargoPackageName(memberToml);
    if (pkgName) {
      return {
        crateName: opts.crateName || opts.package || pkgName,
        cargoPath: member.replace(/\/$/, ""),
      };
    }
  }

  return { crateName, cargoPath };
}

async function resolveSpmBinOptions(
  packageSwiftText: string | null | undefined,
  repoInfo: any,
  opts: any,
) {
  if (opts?.binName || (Array.isArray(opts?.binNames) && opts.binNames.length)) {
    return {};
  }
  const { parseSpmExecutableProducts, preferSpmBinName } = await import(
    "./generators/spm-package.ts"
  );
  const bins = parseSpmExecutableProducts(packageSwiftText || "");
  if (bins.length === 0) return {};
  const formulaName = opts?.name || toFormulaName(repoInfo?.name || "");
  const preferred =
    preferSpmBinName(bins, formulaName, repoInfo?.name || "") || bins[0];
  if (bins.length > 1) {
    console.log(
      `  SPM executables: ${bins.join(", ")} (primary bin: ${preferred})`,
    );
  }
  return { binName: preferred, binNames: bins };
}

/** Fail early for library-only Package.swift / Xcode app monorepos (no CLI product). */
async function assertSpmPackageInstallable(
  packageSwiftText: string | null | undefined,
  fileNames: string[],
  repoInfo: any,
  opts: any,
) {
  if (opts?.binName || (Array.isArray(opts?.binNames) && opts.binNames.length)) {
    return;
  }
  const {
    parseSpmExecutableProducts,
    isLibraryOnlyPackageSwift,
    hasXcodeAppProject,
  } = await import("./generators/spm-package.ts");
  const bins = parseSpmExecutableProducts(packageSwiftText || "");
  if (bins.length > 0) return;

  const xcode = hasXcodeAppProject(fileNames);
  const libraryOnly = isLibraryOnlyPackageSwift(packageSwiftText || "");
  if (!libraryOnly && !xcode) return;

  const xcodeName = fileNames.find((f) =>
    /\.(xcodeproj|xcworkspace)$/i.test(String(f)),
  );
  throw new Error(
    `Cannot install ${repoInfo?.fullName || repoInfo?.name || "this repository"} via spm-package: ` +
      (libraryOnly
        ? "Package.swift has no .executable products (library-only). "
        : "") +
      (xcode
        ? `Xcode project detected (${xcodeName}). This is a native app lab, not a CLI — use Xcode, TestFlight, or a release DMG/ZIP cask when assets exist. `
        : "") +
      `Do not generate a Homebrew formula that runs swift build without a bin product.`,
  );
}

/**
 * Turn a README/repo script install hint into an absolute script URL for the
 * install-script generator. Absolute URLs pass through; relative paths like
 * install.sh become raw.githubusercontent.com URLs on the default branch.
 */
function resolveScriptInstallUrl(
  method: { url?: string; script?: string },
  repoInfo: any,
  owner: string,
  repo: string,
): string | null {
  if (method?.url && /^https?:\/\//i.test(method.url)) {
    return method.url;
  }
  const scriptPath = (method?.script || "")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
  if (!scriptPath) return null;
  // Reject path traversal
  if (scriptPath.includes("..")) return null;
  const branch = repoInfo?.defaultBranch || "main";
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${scriptPath}`;
}

function guessName(generatorName: any, params: any) {
  if (params.name) return String(params.name).toLowerCase();
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
  if (params.description) return String(params.description);
  if (params.repoInfo?.description) return params.repoInfo.description;
  if (params.archiveInfo?.downloadUrl)
    return `Install from ${params.archiveInfo.downloadUrl}`;
  if (params.url) return `Install from ${params.url}`;
  return "";
}
