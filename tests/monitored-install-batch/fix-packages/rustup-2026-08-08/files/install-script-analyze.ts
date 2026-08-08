/**
 * Inspect vendor install scripts before generating an install-script formula.
 * Scripts that only open the Mac App Store, drive distro package managers, or
 * write system paths cannot become Cellar PREFIX installs — reject or Case C.
 */

export type InstallScriptAnalysis = {
  kind:
    | "prefix-ok"
    | "system-wide-out-of-scope"
    | "appstore-macos-only"
    | "home-dir-installer";
  reason?: string;
  packageHint?: string;
  signals: string[];
  appStoreId?: string;
};

const NIX_URL_RE =
  /(?:^|\/\/)(?:(?:www|releases)\.)?nixos\.org\/|(?:^|\/\/)nixos\.org\/nix\/install/i;

const HOMEBREW_INSTALL_URL_RE =
  /raw\.githubusercontent\.com\/Homebrew\/install\//i;

/**
 * Best-effort package token from install URL path/host (e.g. tailscale.com/install.sh).
 */
export function packageHintFromInstallUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    // Official rustup bootstrap: sh.rustup.rs / static.rust-lang.org rustup paths
    if (/(?:^|\.)rustup\.rs$/i.test(host) || host === "sh.rustup.rs") {
      return "rustup";
    }
    if (/static\.rust-lang\.org/i.test(host) && /rustup/i.test(u.pathname)) {
      return "rustup";
    }
    const first = host.split(".")[0];
    if (first && first !== "raw" && first !== "github" && first !== "githubusercontent" && first !== "sh") {
      if (/^[a-z][a-z0-9-]{1,40}$/i.test(first) && first.length > 2) {
        return first.toLowerCase();
      }
    }
    const base = u.pathname.split("/").filter(Boolean).pop() || "";
    const stem = base.replace(/\.(sh|bash)$/i, "");
    if (stem && !/^(install|setup|get|bootstrap)$/i.test(stem)) {
      return stem.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/**
 * Classify install-script body + URL for allbrew packaging suitability.
 */
export function analyzeInstallScript(
  url: string,
  body: string,
): InstallScriptAnalysis {
  const signals: string[] = [];
  const text = String(body || "");
  const lower = text.toLowerCase();
  const packageHint = packageHintFromInstallUrl(url);

  // Official rustup bootstrap (sh.rustup.rs): downloads rustup-init and installs under
  // $HOME/.cargo — not PREFIX/Cellar. Prefer homebrew/core rustup (Case C).
  const RUSTUP_BOOTSTRAP_URL_RE =
    /(?:^|\/\/)sh\.rustup\.rs(?:\/|$)|(?:^|\/\/)(?:www\.)?rustup\.rs\/|static\.rust-lang\.org\/rustup\//i;
  if (
    RUSTUP_BOOTSTRAP_URL_RE.test(url) ||
    (/rustup-init/i.test(text) &&
      /RUSTUP_UPDATE_ROOT|The installer for rustup|static\.rust-lang\.org\/rustup/i.test(
        text,
      ))
  ) {
    signals.push("rustup-bootstrap");
    return {
      kind: "home-dir-installer",
      packageHint: "rustup",
      signals,
      reason:
        "Official rustup bootstrap installs the toolchain manager under $HOME/.cargo " +
        "(via rustup-init) and does not honor Homebrew PREFIX/DESTDIR. Prefer " +
        "homebrew/core formula rustup (Case C) instead of wrapping sh.rustup.rs.",
    };
  }

  if (NIX_URL_RE.test(url) || /releases\.nixos\.org\/nix\//i.test(url)) {
    signals.push("nixos-host");
  }
  if (/\/nix\b|populate[s]?\s+\/nix|creates?\s+and\s+populates?\s+\/nix/i.test(text)) {
    signals.push("writes-/nix");
  }
  if (/\bnix-daemon\b/i.test(text)) {
    signals.push("nix-daemon");
  }
  if (/multi[- ]user/i.test(text) && /\bnix\b/i.test(lower)) {
    signals.push("multi-user-nix");
  }
  if (
    /binary distribution of nix|nix package manager/i.test(text) &&
    /tarball|tar\.xz/i.test(text)
  ) {
    signals.push("nix-binary-tarball-installer");
  }

  const nixSignals = signals.filter((s) =>
    /nix|\/nix|daemon|multi-user/.test(s),
  );
  if (
    nixSignals.length >= 2 ||
    (signals.includes("nixos-host") && signals.includes("writes-/nix")) ||
    (signals.includes("nixos-host") &&
      signals.includes("nix-binary-tarball-installer"))
  ) {
    return {
      kind: "system-wide-out-of-scope",
      packageHint: packageHint || "nix",
      signals,
      reason:
        "Official Nix installer is multi-user/system-wide (populates /nix, installs nix-daemon). " +
        "It cannot be packaged as a Homebrew Cellar PREFIX install-script. " +
        "Install Nix via the upstream installer outside allbrew.",
    };
  }

  if (
    HOMEBREW_INSTALL_URL_RE.test(url) ||
    (/homebrew\/install|install homebrew|NONINTERACTIVE/i.test(text) &&
      /\/opt\/homebrew|\/usr\/local\/Homebrew|Homebrew\/brew/i.test(text))
  ) {
    signals.push("homebrew-bootstrap");
    return {
      kind: "system-wide-out-of-scope",
      packageHint: "homebrew",
      signals,
      reason:
        "Official Homebrew bootstrap installs the package manager itself into " +
        "/opt/homebrew or /usr/local and cannot be a Cellar PREFIX formula.",
    };
  }

  // Mac App Store only (e.g. tailscale install.sh: PACKAGETYPE=appstore + open MAS URL)
  const appStoreIdMatch =
    text.match(/apps\.apple\.com\/[^"'\s]*\/id(\d+)/i) ||
    text.match(/macappstore:\/\/[^"'\s]*id(\d+)/i);
  if (appStoreIdMatch) {
    signals.push("apps-apple-com");
  }
  if (/PACKAGETYPE=["']appstore["']/i.test(text) || /packagetype=appstore/i.test(lower)) {
    signals.push("packagetype-appstore");
  }
  if (
    /OS=["']macos["']/i.test(text) &&
    /open\s+["']https:\/\/apps\.apple\.com/i.test(text)
  ) {
    signals.push("macos-open-appstore");
  }

  const appStoreSignals = signals.filter((s) =>
    /appstore|apps-apple|macos-open/.test(s),
  );
  if (appStoreSignals.length >= 1 && !/\bPREFIX\b|\bDESTDIR\b/i.test(text)) {
    const multiPm =
      /(apt-get|dnf|yum|zypper|pacman|xbps-install|emerge|pkg install)/i.test(
        text,
      );
    if (multiPm) signals.push("multi-distro-pm");

    return {
      kind: "appstore-macos-only",
      packageHint,
      appStoreId: appStoreIdMatch?.[1],
      signals,
      reason:
        "Install script installs via Mac App Store (or distro package managers) and does not " +
        "honor PREFIX/DESTDIR for a Homebrew Cellar install. Prefer an official homebrew/core " +
        "or homebrew/cask package, or a Mac App Store cask, instead of wrapping this script.",
    };
  }

  // Distro multi-PM installer without PREFIX (Linux-first vendor scripts)
  if (
    !/\bPREFIX\b|\bDESTDIR\b/i.test(text) &&
    /(apt-get install|dnf install|yum install|zypper install|pacman -S)/i.test(
      text,
    ) &&
    /(PACKAGETYPE|os-release|ID=)/i.test(text)
  ) {
    signals.push("distro-package-manager-installer");
    return {
      kind: "system-wide-out-of-scope",
      packageHint,
      signals,
      reason:
        "Vendor install script drives OS package managers (apt/dnf/yum/…) and does not " +
        "install into Homebrew PREFIX. Prefer official Homebrew packages when available.",
    };
  }

  if (
    /\$HOME\/\.[A-Za-z0-9_.-]+|\$\{HOME\}\/\.[A-Za-z0-9_.-]+|FLYCTL_INSTALL|XDG_DATA_HOME/i.test(
      text,
    ) &&
    !/\bPREFIX\b|\bDESTDIR\b/i.test(text)
  ) {
    signals.push("home-dir-install");
    return {
      kind: "home-dir-installer",
      packageHint,
      signals,
      reason:
        "Script installs under a user home directory rather than PREFIX/Cellar",
    };
  }

  return { kind: "prefix-ok", packageHint, signals };
}

export function assertInstallScriptInScope(url: string, body: string): void {
  const analysis = analyzeInstallScript(url, body);
  if (
    analysis.kind === "system-wide-out-of-scope" ||
    analysis.kind === "appstore-macos-only"
  ) {
    throw new Error(
      analysis.reason ||
        `Install script at ${url} cannot be packaged as a Homebrew PREFIX install-script`,
    );
  }
}
