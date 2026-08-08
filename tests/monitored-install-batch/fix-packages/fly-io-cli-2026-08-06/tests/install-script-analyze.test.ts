import { describe, expect, test } from "bun:test";
import { analyzeInstallScript } from "../../lib/install-script-analyze.ts";

const FLY_INSTALL_FRAGMENT = `#!/bin/sh
set -e
os=$(uname -s)
arch=$(uname -m)
flyctl_uri=$(curl -s https://api.fly.io/app/flyctl_releases/$os/$arch/latest)
flyctl_install="\${FLYCTL_INSTALL:-\$HOME/.fly}"
bin_dir="$flyctl_install/bin"
exe="$bin_dir/flyctl"
simexe="$bin_dir/fly"
mkdir -p "$bin_dir"
curl -o "$tmp_dir/flyctl.tar.gz" "$flyctl_uri"
tar -C "$tmp_dir" -xzf "$tmp_dir/flyctl.tar.gz"
mv "$tmp_dir/flyctl" "$exe"
ln -sf $exe $simexe
echo "flyctl was installed successfully to $exe"
`;

const PREFIX_HONORING = `#!/bin/sh
PREFIX="\${PREFIX:-/usr/local}"
mkdir -p "$PREFIX/bin"
install -m 755 mytool "$PREFIX/bin/mytool"
`;

const OLLAMA_FRAGMENT = `#!/bin/sh
# Ollama Installer
OLLAMA_APP="Ollama.app"
curl -fsSL https://ollama.com/download/Ollama-darwin.zip -o /tmp/Ollama.zip
unzip /tmp/Ollama.zip -d /Applications
systemctl enable ollama
# ExecStart=/usr/local/bin/ollama serve
`;

describe("analyzeInstallScript", () => {
  test("detects fly.io home-dir installer and flyctl bin", () => {
    const a = analyzeInstallScript(FLY_INSTALL_FRAGMENT, {
      url: "https://fly.io/install.sh",
      name: "fly-io-cli",
    });
    expect(a.usesPrefix).toBe(false);
    expect(a.homeDirInstaller).toBe(true);
    expect(a.looksLikeSystemInstaller).toBe(true);
    expect(a.suggestedBinName).toBe("flyctl");
    expect(a.coreNameCandidates[0]).toBe("flyctl");
    expect(a.signals.some((s) => s.includes("home-dir") || s === "home-dir-installer")).toBe(
      true,
    );
    expect(a.signals).toContain("well-known:flyctl");
  });

  test("PREFIX-honoring scripts are not system installers", () => {
    const a = analyzeInstallScript(PREFIX_HONORING);
    expect(a.usesPrefix).toBe(true);
    expect(a.looksLikeSystemInstaller).toBe(false);
    expect(a.homeDirInstaller).toBe(false);
  });

  test("detects macOS app artifact URLs", () => {
    const a = analyzeInstallScript(OLLAMA_FRAGMENT, { name: "ollama" });
    expect(a.macApp?.appName).toBe("Ollama.app");
    expect(a.macApp?.artifactUrl).toMatch(/Ollama-darwin\.zip/);
  });
});
