#!/usr/bin/env bun
/**
 * Template parity test: feed each generator's payload shape into the template
 * renderer and compare byte-for-byte against the expected legacy output. Any
 * drift between the expected string and the renderer indicates a template bug.
 */

import { renderCask, renderFormula } from "../lib/template-renderer.ts";
import type {
  CaskPayload,
  FormulaPayload,
} from "../lib/template-payload.ts";

type Case = {
  template: string;
  kind: "formula" | "cask";
  payload: FormulaPayload | CaskPayload;
  expected: string;
};

const cases: Case[] = [
  buildNpmPackageCase(),
  buildBinaryReleaseCase(),
  buildBuildFromSourceCase(),
  buildCargoPackageCase(),
  buildGoPackageCase(),
  buildPipPackageCase(),
  buildRawBinaryCase(),
  buildScriptInstallCase(),
  buildSourceArchiveCase(),
  buildGithubReleaseCase(),
  buildCaskAppCase(),
  buildMasAppCase(),
];

function main() {
  let failures = 0;
  for (const c of cases) {
    const actual =
      c.kind === "formula"
        ? renderFormula(c.payload as FormulaPayload)
        : renderCask(c.payload as CaskPayload);

    if (actual === c.expected) {
      console.log(`OK   ${c.template}`);
    } else {
      console.log(`FAIL ${c.template}`);
      console.log("--- expected ---");
      console.log(c.expected);
      console.log("--- actual ---");
      console.log(actual);
      failures++;
    }
  }

  if (failures > 0) {
    console.error(`${failures} template failure(s)`);
    process.exit(1);
  }
}

function buildNpmPackageCase(): Case {
  const livecheck =
    `  livecheck do\n` +
    `    url "https://registry.npmjs.org/foo/latest"\n` +
    `    regex(/"version"\\s*:\\s*"v?([^"\\\\]+)"/i)\n` +
    `  end\n\n`;
  const payload: FormulaPayload = {
    template: "npm_package",
    name: "foo",
    className: "Foo",
    desc: "Foo npm",
    homepage: "https://www.npmjs.com/package/foo",
    url: "https://registry.npmjs.org/foo/-/foo-1.0.0.tgz",
    sha256: "00",
    licenseLine: '  license "MIT"\n',
    livecheckBlock: livecheck,
    allbrewDependency: "tariqwest/tap/allbrew",
    testBinName: "foo",
    serviceBlock: "",
  };
  const expected =
    `class Foo < Formula\n` +
    `  desc "Foo npm"\n` +
    `  homepage "https://www.npmjs.com/package/foo"\n` +
    `  url "https://registry.npmjs.org/foo/-/foo-1.0.0.tgz"\n` +
    `  sha256 "00"\n` +
    `  license "MIT"\n` +
    `\n` +
    livecheck +
    `  depends_on "node"\n` +
    `  depends_on "tariqwest/tap/allbrew"\n` +
    `\n` +
    `  def install\n` +
    `    system "npm", "install", *std_npm_args\n` +
    `    bin.install_symlink libexec.glob("bin/*")\n` +
    `  end\n\n` +
    `  test do\n` +
    `    assert_match version.to_s, shell_output("#{bin}/foo --version")\n` +
    `  end\n` +
    `end\n`;
  return { template: "npm_package", kind: "formula", payload, expected };
}

function buildGithubReleaseCase(): Case {
  const zap =
    `  zap trash: [\n` +
    `    "~/Library/Application Support/Foo",\n` +
    `  ]\n`;
  const payload: CaskPayload = {
    template: "github_release",
    name: "foo",
    version: "1.2.3",
    sha256: "44",
    url: "https://github.com/x/foo/releases/download/v#{version}/Foo-#{version}.dmg",
    displayName: "Foo",
    appName: "Foo.app",
    desc: "Foo cask",
    homepage: "https://github.com/x/foo",
    zapBlock: zap,
  };
  const expected =
    `cask "foo" do\n` +
    `  version "1.2.3"\n` +
    `  sha256 "44"\n\n` +
    `  url "https://github.com/x/foo/releases/download/v#{version}/Foo-#{version}.dmg"\n` +
    `  name "Foo"\n` +
    `  desc "Foo cask"\n` +
    `  homepage "https://github.com/x/foo"\n\n` +
    `  livecheck do\n` +
    `    url :url\n` +
    `    strategy :github_latest\n` +
    `  end\n\n` +
    `  app "Foo.app"\n\n` +
    zap +
    `end\n`;
  return { template: "github_release", kind: "cask", payload, expected };
}

function buildBinaryReleaseCase(): Case {
  const platformBlocks =
    `  on_macos do\n` +
    `    on_arm do\n` +
    `      url "https://example.com/v#{version}/foo-darwin-arm64.tgz"\n` +
    `      sha256 "aa"\n` +
    `    end\n` +
    `  end\n\n`;
  const payload: FormulaPayload = {
    template: "binary_release",
    name: "foo",
    className: "Foo",
    desc: "Foo tool",
    homepage: "https://example.com",
    version: "1.2.3",
    binName: "foo",
    licenseLine: '  license "MIT"\n',
    platformBlocks,
    allbrewDependency: "tariqwest/tap/allbrew",
    testBinName: "foo",
    serviceBlock: "",
  };
  const expected =
    `class Foo < Formula\n` +
    `  desc "Foo tool"\n` +
    `  homepage "https://example.com"\n` +
    `  license "MIT"\n` +
    `  version "1.2.3"\n` +
    `\n` +
    platformBlocks +
    `  livecheck do\n` +
    `    url :stable\n` +
    `    strategy :github_latest\n` +
    `  end\n\n` +
    `  depends_on "tariqwest/tap/allbrew"\n` +
    `\n` +
    `  def install\n` +
    `    bin.install "foo"\n` +
    `  end\n\n` +
    `  test do\n` +
    `    assert_match version.to_s, shell_output("#{bin}/foo --version")\n` +
    `  end\n` +
    `end\n`;
  return { template: "binary_release", kind: "formula", payload, expected };
}

function buildBuildFromSourceCase(): Case {
  const payload: FormulaPayload = {
    template: "build_from_source",
    name: "foo",
    className: "Foo",
    desc: "Foo from source",
    homepage: "https://github.com/x/foo",
    fullName: "x/foo",
    defaultBranch: "main",
    licenseLine: '  license "MIT"\n',
    urlLines: '  url "https://example.com/foo-1.0.tar.gz"\n  sha256 "ab"\n',
    dependenciesLines: `  depends_on "cmake" => :build\n  depends_on "pkg-config" => :build\n`,
    installBody:
      `    system "cmake", "-S", ".", "-B", "build", *std_cmake_args\n` +
      `    system "cmake", "--build", "build"\n` +
      `    system "cmake", "--install", "build"\n`,
    allbrewDependency: "tariqwest/tap/allbrew",
    testBinName: "foo",
    serviceBlock: "",
  };
  const expected =
    `class Foo < Formula\n` +
    `  desc "Foo from source"\n` +
    `  homepage "https://github.com/x/foo"\n` +
    `  license "MIT"\n` +
    `  url "https://example.com/foo-1.0.tar.gz"\n` +
    `  sha256 "ab"\n` +
    `  head "https://github.com/x/foo.git", branch: "main"\n\n` +
    `  depends_on "tariqwest/tap/allbrew"\n` +
    `  depends_on "cmake" => :build\n` +
    `  depends_on "pkg-config" => :build\n\n` +
    `  def install\n` +
    `    system "cmake", "-S", ".", "-B", "build", *std_cmake_args\n` +
    `    system "cmake", "--build", "build"\n` +
    `    system "cmake", "--install", "build"\n` +
    `  end\n\n` +
    `  test do\n` +
    `    assert_match version.to_s, shell_output("#{bin}/foo --version")\n` +
    `  end\n` +
    `end\n`;
  return { template: "build_from_source", kind: "formula", payload, expected };
}

function buildCargoPackageCase(): Case {
  const livecheck =
    `  livecheck do\n` +
    `    url "https://crates.io/api/v1/crates/foo"\n` +
    `    regex(/"max_stable_version":"([^"]+)"/i)\n` +
    `  end\n\n`;
  const payload: FormulaPayload = {
    template: "cargo_package",
    name: "foo",
    className: "Foo",
    desc: "Foo crate",
    homepage: "https://github.com/x/foo",
    fullName: "x/foo",
    defaultBranch: "main",
    licenseLine: '  license "MIT"\n',
    urlLines: '  url "https://example.com/foo-1.0.tar.gz"\n  sha256 "cc"\n',
    livecheckBlock: livecheck,
    allbrewDependency: "tariqwest/tap/allbrew",
    testBinName: "foo",
    serviceBlock: "",
  };
  const expected =
    `class Foo < Formula\n` +
    `  desc "Foo crate"\n` +
    `  homepage "https://github.com/x/foo"\n` +
    `  license "MIT"\n` +
    `  url "https://example.com/foo-1.0.tar.gz"\n` +
    `  sha256 "cc"\n` +
    `  head "https://github.com/x/foo.git", branch: "main"\n\n` +
    livecheck +
    `  depends_on "tariqwest/tap/allbrew"\n` +
    `  depends_on "rust" => :build\n\n` +
    `  def install\n` +
    `    system "cargo", "install", *std_cargo_args\n` +
    `  end\n\n` +
    `  test do\n` +
    `    assert_match version.to_s, shell_output("#{bin}/foo --version")\n` +
    `  end\n` +
    `end\n`;
  return { template: "cargo_package", kind: "formula", payload, expected };
}

function buildGoPackageCase(): Case {
  const livecheck =
    `  livecheck do\n` +
    `    url "https://proxy.golang.org/github.com/x/foo/@latest"\n` +
    `    regex(/"Version":"v?([^"]+)"/i)\n` +
    `  end\n\n`;
  const payload: FormulaPayload = {
    template: "go_package",
    name: "foo",
    className: "Foo",
    desc: "Foo go",
    homepage: "https://github.com/x/foo",
    fullName: "x/foo",
    defaultBranch: "main",
    licenseLine: "",
    urlLines: "",
    livecheckBlock: livecheck,
    allbrewDependency: "tariqwest/tap/allbrew",
    testBinName: "foo",
    serviceBlock: "",
  };
  const expected =
    `class Foo < Formula\n` +
    `  desc "Foo go"\n` +
    `  homepage "https://github.com/x/foo"\n` +
    `  head "https://github.com/x/foo.git", branch: "main"\n\n` +
    livecheck +
    `  depends_on "tariqwest/tap/allbrew"\n` +
    `  depends_on "go" => :build\n\n` +
    `  def install\n` +
    `    system "go", "install", *std_go_args(ldflags: "-s -w")\n` +
    `  end\n\n` +
    `  test do\n` +
    `    assert_match version.to_s, shell_output("#{bin}/foo --version")\n` +
    `  end\n` +
    `end\n`;
  return { template: "go_package", kind: "formula", payload, expected };
}

function buildPipPackageCase(): Case {
  const livecheck =
    `  livecheck do\n` +
    `    url "https://pypi.org/pypi/foo/json"\n` +
    `    regex(/"version"\\s*:\\s*"([^"]+)"/i)\n` +
    `  end\n\n`;
  const resources =
    `  resource "click" do\n` +
    `    url "https://example.com/click.tgz"\n` +
    `    sha256 "dd"\n` +
    `  end\n\n`;
  const payload: FormulaPayload = {
    template: "pip_package",
    name: "foo",
    className: "Foo",
    desc: "Foo pip",
    homepage: "https://pypi.org/project/foo/",
    url: "https://example.com/foo.tgz",
    sha256: "ee",
    licenseLine: '  license "MIT"\n',
    livecheckBlock: livecheck,
    resourcesBlock: resources,
    allbrewDependency: "tariqwest/tap/allbrew",
    testBinName: "foo",
    serviceBlock: "",
  };
  const expected =
    `class Foo < Formula\n` +
    `  include Language::Python::Virtualenv\n\n` +
    `  desc "Foo pip"\n` +
    `  homepage "https://pypi.org/project/foo/"\n` +
    `  url "https://example.com/foo.tgz"\n` +
    `  sha256 "ee"\n` +
    `  license "MIT"\n` +
    `\n` +
    livecheck +
    `  depends_on "tariqwest/tap/allbrew"\n` +
    `  depends_on "python@3.13"\n\n` +
    resources +
    `  def install\n` +
    `    virtualenv_install_with_resources\n` +
    `  end\n\n` +
    `  test do\n` +
    `    assert_match version.to_s, shell_output("#{bin}/foo --version")\n` +
    `  end\n` +
    `end\n`;
  return { template: "pip_package", kind: "formula", payload, expected };
}

function buildRawBinaryCase(): Case {
  const installBody =
    `    bin.install "foo"\n` + `\n` + `    man1.install "foo.1"\n`;
  const payload: FormulaPayload = {
    template: "raw_binary",
    name: "foo",
    className: "Foo",
    desc: "Install foo",
    homepage: "https://example.com/foo.tgz",
    url: "https://example.com/foo.tgz",
    sha256: "ff",
    installBody,
    allbrewDependency: "tariqwest/tap/allbrew",
    testBinName: "foo",
    serviceBlock: "",
  };
  const expected =
    `class Foo < Formula\n` +
    `  desc "Install foo"\n` +
    `  homepage "https://example.com/foo.tgz"\n` +
    `  url "https://example.com/foo.tgz"\n` +
    `  sha256 "ff"\n` +
    `  license "MIT"\n\n` +
    `  depends_on "tariqwest/tap/allbrew"\n\n` +
    `  def install\n` +
    installBody +
    `  end\n\n` +
    `  test do\n` +
    `    assert_match version.to_s, shell_output("#{bin}/foo --version")\n` +
    `  end\n` +
    `end\n`;
  return { template: "raw_binary", kind: "formula", payload, expected };
}

function buildScriptInstallCase(): Case {
  const payload: FormulaPayload = {
    template: "script_install",
    name: "foo",
    className: "Foo",
    desc: "Install foo via setup script",
    homepage: "https://example.com/install.sh",
    url: "https://example.com/install.sh",
    sha256: "11",
    scriptFilename: "install.sh",
    allbrewDependency: "tariqwest/tap/allbrew",
    testBinName: "foo",
    serviceBlock: "",
  };
  const expected =
    `class Foo < Formula\n` +
    `  desc "Install foo via setup script"\n` +
    `  homepage "https://example.com/install.sh"\n` +
    `  url "https://example.com/install.sh"\n` +
    `  sha256 "11"\n` +
    `  license "MIT"\n\n` +
    `  depends_on "tariqwest/tap/allbrew"\n\n` +
    `  def install\n` +
    `    ENV["PREFIX"] = prefix.to_s\n` +
    `    ENV["DESTDIR"] = prefix.to_s\n` +
    `    ENV["HOME"] = buildpath.to_s\n` +
    `    system "bash", "install.sh"\n` +
    `    bin.install Dir[buildpath/"bin/*"] if (buildpath/"bin").exist?\n` +
    `    bin.install Dir[prefix/"bin/*"] if (prefix/"bin").exist?\n` +
    `  end\n\n` +
    `  test do\n` +
    `    assert_match version.to_s, shell_output("#{bin}/foo --version")\n` +
    `  end\n` +
    `end\n`;
  return { template: "script_install", kind: "formula", payload, expected };
}

function buildSourceArchiveCase(): Case {
  const installBody =
    `    system "meson", "setup", "build", *std_meson_args\n` +
    `    system "meson", "compile", "-C", "build"\n` +
    `    system "meson", "install", "-C", "build"\n`;
  const payload: FormulaPayload = {
    template: "source_archive",
    name: "foo",
    className: "Foo",
    desc: "Install foo from source archive",
    homepage: "https://example.com/foo.tgz",
    url: "https://example.com/foo.tgz",
    sha256: "22",
    dependenciesLines: `  depends_on "meson" => :build\n  depends_on "ninja" => :build\n`,
    installBody,
    allbrewDependency: "tariqwest/tap/allbrew",
    testBinName: "foo",
    serviceBlock: "",
  };
  const expected =
    `class Foo < Formula\n` +
    `  desc "Install foo from source archive"\n` +
    `  homepage "https://example.com/foo.tgz"\n` +
    `  url "https://example.com/foo.tgz"\n` +
    `  sha256 "22"\n` +
    `  license "MIT"\n\n` +
    `  depends_on "tariqwest/tap/allbrew"\n` +
    `  depends_on "meson" => :build\n` +
    `  depends_on "ninja" => :build\n\n` +
    `  def install\n` +
    installBody +
    `  end\n\n` +
    `  test do\n` +
    `    assert_match version.to_s, shell_output("#{bin}/foo --version")\n` +
    `  end\n` +
    `end\n`;
  return { template: "source_archive", kind: "formula", payload, expected };
}

function buildCaskAppCase(): Case {
  const payload: CaskPayload = {
    template: "cask_app",
    name: "foo-app",
    sha256: "33",
    url: "https://example.com/Foo.dmg",
    displayName: "Foo",
    desc: "Install Foo",
    versionLine: '  version "1.2.3"\n',
    homepageLine: '  homepage "https://example.com"\n',
    appOrPkgBlock: `  app "Foo.app"\n`,
  };
  const expected =
    `cask "foo-app" do\n` +
    `  version "1.2.3"\n` +
    `  sha256 "33"\n\n` +
    `  url "https://example.com/Foo.dmg"\n` +
    `  name "Foo"\n` +
    `  desc "Install Foo"\n` +
    `  homepage "https://example.com"\n` +
    `\n` +
    `  app "Foo.app"\n` +
    `end\n`;
  return { template: "cask_app", kind: "cask", payload, expected };
}

function buildMasAppCase(): Case {
  const zap =
    `  zap trash: [\n` +
    `    "~/Library/Application Support/Foo",\n` +
    `    "~/Library/Caches/com.example.foo",\n` +
    `    "~/Library/Preferences/com.example.foo.plist",\n` +
    `    "~/Library/Saved Application State/com.example.foo.savedState",\n` +
    `  ]\n`;
  const payload: CaskPayload = {
    template: "mas_app",
    name: "foo",
    appId: "12345",
    appName: "Foo",
    version: "9.9",
    desc: "Foo from MAS",
    homepage: "https://example.com",
    zapBlock: zap,
  };
  const expected =
    `cask "foo" do\n` +
    `  version "9.9"\n` +
    `  sha256 :no_check\n\n` +
    `  url "macappstore://apps.apple.com/app/id12345?mt=12"\n` +
    `  name "Foo"\n` +
    `  desc "Foo from MAS"\n` +
    `  homepage "https://example.com"\n\n` +
    `  depends_on formula: "mas"\n\n` +
    `  installer script: {\n` +
    `    executable: "mas",\n` +
    `    args: ["install", "12345"],\n` +
    `  }\n\n` +
    `  uninstall delete: "/Applications/Foo.app"\n\n` +
    zap +
    `end\n`;
  return { template: "mas_app", kind: "cask", payload, expected };
}

main();
