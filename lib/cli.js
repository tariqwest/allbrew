import { select, input, confirm, checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { classify, classifyWithHead } from './classifier.js';
import { initOctokit, getRepoInfo, getLatestRelease, getReadme, getRepoContents, getFileContent } from './github.js';
import { detectBrewInstall, detectInstallMethod, detectBuildSystemFromFiles } from './analyzer.js';
import { inspectArchive } from './archive-inspector.js';
import { matchAssetToArch, isAppAsset, isBinaryAsset } from './utils.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function run(url, opts = {}) {
  if (opts.token) initOctokit(opts.token);

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
      case 'github-repo':
        return await handleGithubRepo(classification, opts);
      case 'bash-script':
        return await handleBashScript(classification.url, opts);
      case 'cask-dmg':
        return await handleCaskDmg(classification.url, opts);
      case 'archive':
        return await handleArchive(classification.url, opts);
      case 'mac-app-store':
        return await handleMacAppStore(classification.url, opts);
      default:
        console.log(chalk.yellow(`\nUnable to automatically determine how to handle this URL.`));
        const choice = await select({
          message: 'What type of content does this URL point to?',
          choices: [
            { name: 'Bash/shell install script', value: 'bash-script' },
            { name: 'Archive containing source code', value: 'archive' },
            { name: 'Archive containing a pre-built binary', value: 'archive' },
            { name: 'DMG or archive containing a macOS .app', value: 'cask-dmg' },
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

async function handleGithubRepo(classification, opts) {
  const { owner, repo } = classification;
  const spinner = ora('Fetching repository info...').start();

  const repoInfo = await getRepoInfo(owner, repo);
  spinner.succeed(`Repository: ${chalk.bold(repoInfo.fullName)} - ${repoInfo.description || 'No description'}`);

  if (repoInfo.license) {
    console.log(`  License: ${chalk.dim(repoInfo.license)}`);
  }

  // Step 1: Check releases
  const releaseSpinner = ora('Checking for releases...').start();
  const release = await getLatestRelease(owner, repo);

  if (release) {
    releaseSpinner.succeed(`Latest release: ${chalk.bold(release.tagName)} (${release.assets.length} assets)`);

    const appAssets = release.assets.filter(a => isAppAsset(a.name));
    const binAssets = release.assets.filter(a => isBinaryAsset(a.name) && matchAssetToArch(a.name));

    if (appAssets.length > 0 && binAssets.length > 0) {
      console.log();
      console.log(`  Found ${chalk.cyan(appAssets.length)} app asset(s) and ${chalk.cyan(binAssets.length)} binary asset(s)`);

      const choice = await select({
        message: 'This release has both app bundles and CLI binaries. Which should we use?',
        choices: [
          { name: `macOS App Cask (${appAssets.map(a => a.name).join(', ')})`, value: 'cask' },
          { name: `CLI Binary Formula (${binAssets.map(a => a.name).join(', ')})`, value: 'binary' },
        ],
      });

      if (choice === 'cask') {
        return await generateWithConfirmation('github-release-cask', { repoInfo, release }, opts);
      } else {
        return await generateWithConfirmation('binary-release', { repoInfo, release }, opts);
      }
    }

    if (appAssets.length > 0) {
      console.log(`  Detected ${chalk.cyan('macOS app')} assets: ${appAssets.map(a => a.name).join(', ')}`);
      return await generateWithConfirmation('github-release-cask', { repoInfo, release }, opts);
    }

    if (binAssets.length > 0) {
      console.log(`  Detected ${chalk.cyan('binary')} assets: ${binAssets.map(a => a.name).join(', ')}`);
      return await generateWithConfirmation('binary-release', { repoInfo, release }, opts);
    }

    console.log(chalk.dim('  No recognized binary or app assets, checking README...'));
  } else {
    releaseSpinner.info('No releases found, checking README...');
  }

  // Step 2: Fetch and analyze README
  const readmeSpinner = ora('Fetching README...').start();
  const readme = await getReadme(owner, repo);

  if (!readme) {
    readmeSpinner.warn('No README found');
  } else {
    readmeSpinner.succeed('README fetched');

    // Check for existing Homebrew availability first
    const brewInfo = detectBrewInstall(readme);
    if (brewInfo) {
      console.log();
      console.log(chalk.yellow.bold('  This package appears to be available via Homebrew!'));
      console.log(`  Detected command: ${chalk.cyan(brewInfo.installCommand)}`);
      console.log();

      const choice = await select({
        message: 'What would you like to do?',
        choices: [
          { name: `Run "${brewInfo.installCommand}" directly`, value: 'brew-install' },
          { name: 'Generate a custom formula anyway', value: 'continue' },
        ],
      });

      if (choice === 'brew-install') {
        console.log();
        const installSpinner = ora(`Running: ${brewInfo.installCommand}`).start();
        try {
          const parts = brewInfo.installCommand.split(/\s*&&\s*/);
          for (const cmd of parts) {
            const args = cmd.trim().split(/\s+/);
            await execFileAsync(args[0], args.slice(1));
          }
          installSpinner.succeed('Installation complete!');
          return { type: 'brew-install', command: brewInfo.installCommand };
        } catch (err) {
          installSpinner.fail(`Installation failed: ${err.message}`);
          process.exit(1);
        }
      }
    }

    // Detect install method from README
    const method = detectInstallMethod(readme);
    if (method) {
      console.log(`  Detected install method: ${chalk.cyan(method.method)}${method.package ? ` (${method.package})` : ''}`);

      switch (method.method) {
        case 'npm':
          return await generateWithConfirmation('npm-package', {
            packageName: method.package,
            repoInfo,
          }, opts);
        case 'pip':
          return await generateWithConfirmation('pip-package', {
            packageName: method.package,
            repoInfo,
          }, opts);
        case 'cargo':
          return await generateWithConfirmation('cargo-package', {
            repoInfo,
            release,
          }, opts);
        case 'build':
          return await generateWithConfirmation('build-from-source', {
            repoInfo,
            release,
            buildSystem: method,
          }, opts);
      }
    }
  }

  // Step 3: Detect from repo files
  const filesSpinner = ora('Inspecting repository files...').start();
  const files = await getRepoContents(owner, repo);
  const fileNames = files.map(f => f.name);
  filesSpinner.succeed(`Found ${files.length} root files`);

  const buildSystem = detectBuildSystemFromFiles(fileNames);
  if (buildSystem) {
    console.log(`  Detected build system: ${chalk.cyan(buildSystem.method)}${buildSystem.system ? ` (${buildSystem.system})` : ''}`);

    switch (buildSystem.method) {
      case 'npm': {
        const pkgJson = await getFileContent(owner, repo, 'package.json');
        let packageName = repoInfo.name;
        if (pkgJson) {
          try {
            const pkg = JSON.parse(pkgJson);
            packageName = pkg.name || packageName;
          } catch { /* use repo name */ }
        }
        return await generateWithConfirmation('npm-package', { packageName, repoInfo }, opts);
      }
      case 'pip':
        return await generateWithConfirmation('pip-package', {
          packageName: repoInfo.name,
          repoInfo,
        }, opts);
      case 'cargo':
        return await generateWithConfirmation('cargo-package', { repoInfo, release }, opts);
      case 'build':
        return await generateWithConfirmation('build-from-source', {
          repoInfo,
          release,
          buildSystem,
        }, opts);
    }
  }

  // Fallback: build from source with make
  console.log(chalk.dim('  No specific build system detected, defaulting to build-from-source'));
  return await generateWithConfirmation('build-from-source', {
    repoInfo,
    release,
    buildSystem: { system: 'make' },
  }, opts);
}

async function handleBashScript(url, opts) {
  return await generateWithConfirmation('script-install', { url }, opts);
}

async function handleCaskDmg(url, opts) {
  return await generateWithConfirmation('cask-app', { url }, opts);
}

async function handleArchive(url, opts) {
  const spinner = ora('Downloading and inspecting archive...').start();
  const archiveInfo = await inspectArchive(url);
  spinner.succeed(`Archive type: ${chalk.bold(archiveInfo.type)}`);

  switch (archiveInfo.type) {
    case 'app':
      console.log(`  Found app bundle: ${chalk.cyan(archiveInfo.appName)}`);
      return await generateWithConfirmation('cask-app', {
        url,
        appName: archiveInfo.appName,
      }, opts);

    case 'source':
      console.log('  Contains source code with build markers');
      return await generateWithConfirmation('source-archive', { archiveInfo }, opts);

    case 'binary': {
      console.log(`  Found ${chalk.cyan(archiveInfo.binaries.length)} executable(s): ${archiveInfo.binaries.map(b => b.split('/').pop()).join(', ')}`);

      let selected = archiveInfo.binaries;
      if (archiveInfo.binaries.length > 1) {
        selected = await checkbox({
          message: 'Select which binaries to install:',
          choices: archiveInfo.binaries.map(b => ({
            name: b.split('/').pop(),
            value: b,
            checked: true,
          })),
        });
      }
      return await generateWithConfirmation('raw-binary', {
        archiveInfo,
        selectedBinaries: selected,
      }, opts);
    }

    default:
      console.log(chalk.yellow('  Could not determine archive contents'));
      const choice = await select({
        message: 'How should this archive be treated?',
        choices: [
          { name: 'Source code (build from source)', value: 'source' },
          { name: 'Pre-built binary', value: 'binary' },
          { name: 'macOS app bundle', value: 'app' },
        ],
      });

      if (choice === 'source') {
        return await generateWithConfirmation('source-archive', { archiveInfo }, opts);
      } else if (choice === 'binary') {
        archiveInfo.binaries = archiveInfo.files;
        return await generateWithConfirmation('raw-binary', { archiveInfo }, opts);
      } else {
        return await generateWithConfirmation('cask-app', { url }, opts);
      }
  }
}

async function handleMacAppStore(url, opts) {
  return await generateWithConfirmation('mas-app', { url }, opts);
}

async function generateWithConfirmation(generatorName, params, opts) {
  console.log();

  const userOpts = {};
  if (!opts.name) {
    const defaultName = guessName(generatorName, params);
    const name = await input({
      message: 'Formula/cask name:',
      default: defaultName,
    });
    userOpts.name = name;
  } else {
    userOpts.name = opts.name;
  }

  if (!opts.desc) {
    const defaultDesc = guessDesc(generatorName, params);
    const desc = await input({
      message: 'Description:',
      default: defaultDesc,
    });
    userOpts.desc = desc;
  } else {
    userOpts.desc = opts.desc;
  }

  const mergedOpts = { ...opts, ...userOpts };

  console.log();
  const spinner = ora('Generating formula...').start();

  let result;
  switch (generatorName) {
    case 'binary-release': {
      const { generateBinaryRelease } = await import('./generators/binary-release.js');
      result = await generateBinaryRelease(params.repoInfo, params.release, mergedOpts);
      break;
    }
    case 'build-from-source': {
      const { generateBuildFromSource } = await import('./generators/build-from-source.js');
      result = await generateBuildFromSource(params.repoInfo, params.release, params.buildSystem, mergedOpts);
      break;
    }
    case 'npm-package': {
      const { generateNpmPackage } = await import('./generators/npm-package.js');
      result = await generateNpmPackage(params.packageName, params.repoInfo, mergedOpts);
      break;
    }
    case 'pip-package': {
      const { generatePipPackage } = await import('./generators/pip-package.js');
      result = await generatePipPackage(params.packageName, params.repoInfo, mergedOpts);
      break;
    }
    case 'cargo-package': {
      const { generateCargoPackage } = await import('./generators/cargo-package.js');
      result = await generateCargoPackage(params.repoInfo, params.release, mergedOpts);
      break;
    }
    case 'script-install': {
      const { generateScriptInstall } = await import('./generators/script-install.js');
      result = await generateScriptInstall(params.url, mergedOpts);
      break;
    }
    case 'source-archive': {
      const { generateSourceArchive } = await import('./generators/source-archive.js');
      result = await generateSourceArchive(params.archiveInfo, mergedOpts);
      break;
    }
    case 'raw-binary': {
      const { generateRawBinary } = await import('./generators/raw-binary.js');
      result = await generateRawBinary(params.archiveInfo, params.selectedBinaries, mergedOpts);
      break;
    }
    case 'cask-app': {
      const { generateCaskApp } = await import('./generators/cask-app.js');
      result = await generateCaskApp(params.url, { ...mergedOpts, appName: params.appName });
      break;
    }
    case 'github-release-cask': {
      const { generateGithubReleaseCask } = await import('./generators/github-release-cask.js');
      result = await generateGithubReleaseCask(params.repoInfo, params.release, mergedOpts);
      break;
    }
    case 'mas-app': {
      const { generateMasApp } = await import('./generators/mas-app.js');
      result = await generateMasApp(params.url, mergedOpts);
      break;
    }
    default:
      spinner.fail(`Unknown generator: ${generatorName}`);
      process.exit(1);
  }

  spinner.succeed(`Generated: ${chalk.green(result.filePath)}`);
  console.log();

  if (result.type === 'formula') {
    console.log(chalk.dim(`  Install with: brew tap tariqwest/allbrew && brew install ${result.name}`));
  } else {
    console.log(chalk.dim(`  Install with: brew tap tariqwest/allbrew && brew install --cask ${result.name}`));
  }
  console.log();

  return result;
}

function guessName(generatorName, params) {
  if (params.repoInfo) return params.repoInfo.name.toLowerCase();
  if (params.packageName) return params.packageName.toLowerCase().replace(/^@/, '').replace(/\//, '-');
  if (params.url) {
    const filename = params.url.split('/').pop().split('?')[0];
    return filename.replace(/\.(sh|bash|tar\.gz|tgz|zip|dmg|pkg)$/i, '').toLowerCase();
  }
  return 'my-package';
}

function guessDesc(generatorName, params) {
  if (params.repoInfo?.description) return params.repoInfo.description;
  if (params.archiveInfo?.downloadUrl) return `Install from ${params.archiveInfo.downloadUrl}`;
  if (params.url) return `Install from ${params.url}`;
  return '';
}
