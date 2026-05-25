#!/usr/bin/env node

import { program } from 'commander';
import { run } from '../lib/cli.js';

program
  .name('allbrew')
  .description('Generate Homebrew formulas and casks from arbitrary URLs')
  .version('1.0.0')
  .argument('[url]', 'URL to a GitHub repo, script, binary, archive, or Mac App Store app')
  .option('-n, --name <name>', 'Override the formula/cask name')
  .option('-d, --desc <description>', 'Override the description')
  .option('-t, --token <token>', 'GitHub personal access token (or set GITHUB_TOKEN)')
  .option('-v, --verbose', 'Show verbose error output')
  .action(async (url, opts) => {
    if (!url) {
      const { input } = await import('@inquirer/prompts');
      url = await input({
        message: 'Enter a URL (GitHub repo, script, binary, archive, or App Store link):',
        validate: (v) => {
          try { new URL(v); return true; }
          catch { return 'Please enter a valid URL'; }
        },
      });
    }

    try {
      new URL(url);
    } catch {
      console.error(`Error: "${url}" is not a valid URL`);
      process.exit(1);
    }

    await run(url, opts);
  });

program.parse();
