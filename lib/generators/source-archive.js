import { toFormulaName, toClassName, rubyString, writeFormula } from '../utils.js';
import { detectBuildSystemFromArchive } from '../analyzer.js';

export async function generateSourceArchive(archiveInfo, options = {}) {
  const { downloadUrl, sha256, files } = archiveInfo;

  const filename = downloadUrl.split('/').pop().split('?')[0] || 'source';
  const baseName = filename
    .replace(/\.tar\.(gz|bz2|xz)$/i, '')
    .replace(/\.(tgz|zip)$/i, '')
    .replace(/-[\d.]+$/, '');

  const name = options.name || toFormulaName(baseName);
  const className = toClassName(name);
  const desc = options.desc || `Install ${baseName} from source archive`;

  const buildInfo = archiveInfo.forcedBuildSystem || detectBuildSystemFromArchive(files);

  let ruby = `class ${className} < Formula\n`;
  ruby += `  desc ${rubyString(desc)}\n`;
  ruby += `  homepage ${rubyString(downloadUrl)}\n`;
  ruby += `  url ${rubyString(downloadUrl)}\n`;
  ruby += `  sha256 ${rubyString(sha256)}\n`;
  ruby += `  license "MIT"\n\n`;

  if (buildInfo) {
    const deps = getBuildDeps(buildInfo);
    for (const dep of deps) {
      ruby += `  depends_on ${dep}\n`;
    }
    if (deps.length > 0) ruby += `\n`;
  }

  ruby += `  def install\n`;
  ruby += getInstallCommands(buildInfo, name);
  ruby += `  end\n\n`;

  ruby += `  test do\n`;
  ruby += `    assert_match version.to_s, shell_output("#{bin}/${name} --version")\n`;
  ruby += `  end\n`;
  ruby += `end\n`;

  const filePath = await writeFormula(name, ruby);
  return { filePath, name, className, type: 'formula' };
}

function getBuildDeps(buildInfo) {
  if (!buildInfo) return [];

  switch (buildInfo.method) {
    case 'build':
      switch (buildInfo.system) {
        case 'cmake': return ['"cmake" => :build', '"pkg-config" => :build'];
        case 'autotools': return ['"autoconf" => :build', '"automake" => :build'];
        case 'meson': return ['"meson" => :build', '"ninja" => :build'];
        default: return [];
      }
    case 'cargo': return ['"rust" => :build'];
    case 'go': return ['"go" => :build'];
    case 'npm': return ['"node"'];
    case 'pip': return ['"python@3.13"'];
    default: return [];
  }
}

function getInstallCommands(buildInfo, name) {
  if (!buildInfo) {
    return `    system "make", "PREFIX=#{prefix}", "install"\n`;
  }

  switch (buildInfo.method) {
    case 'script':
      return `    ENV["PREFIX"] = prefix.to_s\n` +
             `    ENV["DESTDIR"] = prefix.to_s\n` +
             `    system "bash", "${buildInfo.script.split('/').pop()}"\n`;

    case 'build':
      switch (buildInfo.system) {
        case 'cmake':
          return `    system "cmake", "-S", ".", "-B", "build", *std_cmake_args\n` +
                 `    system "cmake", "--build", "build"\n` +
                 `    system "cmake", "--install", "build"\n`;
        case 'autotools':
          return `    system "./configure", "--disable-silent-rules", *std_configure_args\n` +
                 `    system "make", "install"\n`;
        case 'meson':
          return `    system "meson", "setup", "build", *std_meson_args\n` +
                 `    system "meson", "compile", "-C", "build"\n` +
                 `    system "meson", "install", "-C", "build"\n`;
        default:
          return `    system "make", "PREFIX=#{prefix}", "install"\n`;
      }

    case 'cargo':
      return `    system "cargo", "install", *std_cargo_args\n`;

    case 'go':
      return `    system "go", "build", *std_go_args(ldflags: "-s -w")\n`;

    case 'npm':
      return `    system "npm", "install", *std_npm_args\n` +
             `    bin.install_symlink libexec.glob("bin/*")\n`;

    case 'pip':
      return `    virtualenv_install_with_resources\n`;

    default:
      return `    system "make", "PREFIX=#{prefix}", "install"\n`;
  }
}
