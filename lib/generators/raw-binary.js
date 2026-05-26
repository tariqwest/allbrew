import { toFormulaName, toClassName, rubyString, writeFormula } from '../utils.js';

export async function generateRawBinary(archiveInfo, selectedBinaries = null, options = {}) {
  const { downloadUrl, sha256, binaries, extras = {} } = archiveInfo;

  const bins = selectedBinaries || binaries;
  if (!bins || bins.length === 0) {
    throw new Error('No binary executables found in archive');
  }

  const filename = downloadUrl.split('/').pop().split('?')[0] || 'binary';
  const baseName = filename
    .replace(/\.tar\.(gz|bz2|xz)$/i, '')
    .replace(/\.(tgz|zip)$/i, '')
    .replace(/-[\d.]+$/, '');

  const name = options.name || toFormulaName(baseName);
  const className = toClassName(name);
  const desc = options.desc || `Install ${baseName}`;

  let ruby = `class ${className} < Formula\n`;
  ruby += `  desc ${rubyString(desc)}\n`;
  ruby += `  homepage ${rubyString(downloadUrl)}\n`;
  ruby += `  url ${rubyString(downloadUrl)}\n`;
  ruby += `  sha256 ${rubyString(sha256)}\n`;
  ruby += `  license "MIT"\n\n`;

  ruby += `  def install\n`;

  for (const bin of bins) {
    const binName = bin.split('/').pop();
    if (bin.includes('/')) {
      ruby += `    bin.install "${bin}" => "${binName}"\n`;
    } else {
      ruby += `    bin.install "${binName}"\n`;
    }
  }

  if (extras.manPages?.length > 0) {
    ruby += `\n`;
    for (const manPage of extras.manPages) {
      const section = manPage.match(/\.(\d)$/)?.[1] || '1';
      ruby += `    man${section}.install "${manPage}"\n`;
    }
  }

  if (extras.completions?.length > 0) {
    ruby += `\n`;
    for (const comp of extras.completions) {
      const lower = comp.toLowerCase();
      if (lower.endsWith('.bash') || lower.includes('bash')) {
        ruby += `    bash_completion.install "${comp}"\n`;
      } else if (lower.endsWith('.zsh') || lower.includes('zsh')) {
        ruby += `    zsh_completion.install "${comp}"\n`;
      } else if (lower.endsWith('.fish') || lower.includes('fish')) {
        ruby += `    fish_completion.install "${comp}"\n`;
      }
    }
  }

  if (extras.licenses?.length > 0) {
    ruby += `\n`;
    for (const lic of extras.licenses) {
      ruby += `    share.install "${lic}"\n`;
    }
  }

  ruby += `  end\n\n`;

  const primaryBin = bins[0].split('/').pop();
  ruby += `  test do\n`;
  ruby += `    assert_match version.to_s, shell_output("#{bin}/${primaryBin} --version")\n`;
  ruby += `  end\n`;
  ruby += `end\n`;

  const filePath = await writeFormula(name, ruby, options.tapPath);
  return { filePath, name, className, type: 'formula' };
}
