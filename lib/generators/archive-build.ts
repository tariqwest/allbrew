import {
  toFormulaName,
  toClassName,
  rubyEscape,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { detectBuildSystemFromArchive } from "../analyzer.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import { urlVersionLivecheckBlock } from "./livecheck.ts";
import type { ArchiveBuildPayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

export async function collectArchiveBuildPayload(
  archiveInfo: any,
  options: any = {},
): Promise<ArchiveBuildPayload> {
  const { downloadUrl, sha256, files } = archiveInfo;

  const filename = downloadUrl.split("/").pop().split("?")[0] || "source";
  const baseName = filename
    .replace(/\.tar\.(gz|bz2|xz)$/i, "")
    .replace(/\.(tgz|zip)$/i, "")
    .replace(/-[\d.]+$/, "");

  const name = options.name || toFormulaName(baseName);
  const className = toClassName(name);
  const desc = options.desc || `Install ${baseName} from source archive`;

  const buildInfo =
    archiveInfo.forcedBuildSystem || detectBuildSystemFromArchive(files);

  return {
    template: "archive_build",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(downloadUrl),
    url: rubyEscape(downloadUrl),
    sha256: rubyEscape(sha256),
    dependenciesLines: buildDependenciesLines(buildInfo),
    installBody: buildInstallBody(buildInfo, name),
    livecheckBlock: urlVersionLivecheckBlock(downloadUrl),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(name),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
  };
}

function buildDependenciesLines(buildInfo: any) {
  if (!buildInfo) return "";
  const deps = getBuildDeps(buildInfo);
  return deps.map((dep) => `  depends_on ${dep}\n`).join("");
}

function buildInstallBody(buildInfo: any, _name: string) {
  return getInstallCommands(buildInfo);
}

function getBuildDeps(buildInfo: any): string[] {
  if (!buildInfo) return [];

  switch (buildInfo.method) {
    case "build":
      switch (buildInfo.system) {
        case "cmake":
          return ['"cmake" => :build', '"pkg-config" => :build'];
        case "autotools":
          return ['"autoconf" => :build', '"automake" => :build'];
        case "meson":
          return ['"meson" => :build', '"ninja" => :build'];
        default:
          return [];
      }
    case "cargo":
      return ['"rust" => :build'];
    case "go":
      return ['"go" => :build'];
    case "npm":
      return ['"node"'];
    case "pip":
      return ['"python@3.13"'];
    default:
      return [];
  }
}

function getInstallCommands(buildInfo: any) {
  if (!buildInfo) {
    return `    system "make", "PREFIX=#{prefix}", "install"\n`;
  }

  switch (buildInfo.method) {
    case "script":
      return (
        `    ENV["PREFIX"] = prefix.to_s\n` +
        `    ENV["DESTDIR"] = prefix.to_s\n` +
        `    system "bash", "${rubyEscape(buildInfo.script.split("/").pop())}"\n`
      );

    case "build":
      switch (buildInfo.system) {
        case "cmake":
          return (
            `    system "cmake", "-S", ".", "-B", "build", *std_cmake_args\n` +
            `    system "cmake", "--build", "build"\n` +
            `    system "cmake", "--install", "build"\n`
          );
        case "autotools":
          return (
            `    system "./configure", "--disable-silent-rules", *std_configure_args\n` +
            `    system "make", "install"\n`
          );
        case "meson":
          return (
            `    system "meson", "setup", "build", *std_meson_args\n` +
            `    system "meson", "compile", "-C", "build"\n` +
            `    system "meson", "install", "-C", "build"\n`
          );
        default:
          return `    system "make", "PREFIX=#{prefix}", "install"\n`;
      }

    case "cargo":
      return `    system "cargo", "install", *std_cargo_args\n`;

    case "go":
      return `    system "go", "build", *std_go_args(ldflags: "-s -w")\n`;

    case "npm":
      return (
        `    system "npm", "install", *std_npm_args\n` +
        `    bin.install_symlink libexec.glob("bin/*")\n`
      );

    case "pip":
      return `    virtualenv_install_with_resources\n`;

    default:
      return `    system "make", "PREFIX=#{prefix}", "install"\n`;
  }
}

export async function generateArchiveBuild(
  archiveInfo: any,
  options: any = {},
) {
  const payload = await collectArchiveBuildPayload(archiveInfo, options);
  return writeRenderedFormula(payload, options.tapPath);
}
