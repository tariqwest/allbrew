/**
 * Inspect vendor install scripts before generating an install-script formula.
 * Some scripts are system-wide (Nix multi-user, official Homebrew bootstrap)
 * and cannot be expressed as Cellar PREFIX installs — reject with a clear
 * out-of-scope error.
 */

export type InstallScriptAnalysis = {
  kind: "prefix-ok" | "system-wide-out-of-scope" | "home-dir-installer";
  reason?: string;
  packageHint?: string;
  signals: string[];
};

const NIX_URL_RE =
  /(?:^|\/\/)(?:(?:www|releases)\.)?nixos\.org\/|(?:^|\/\/)nixos\.org\/nix\/install/i;

const HOMEBREW_INSTALL_URL_RE =
  /(?:raw\.)?githubusercontent\.com\/Homebrew\/install\b|github\.com\/Homebrew\/install\b|brew\.sh\/install|install\.sh.*Homebrew/i;

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

  // --- Official Homebrew bootstrap (meta-recursive / system prefix) ---
  if (HOMEBREW_INSTALL_URL_RE.test(url) || /\/Homebrew\/install\//i.test(url)) {
    signals.push("homebrew-install-url");
  }
  if (
    /homebrew cannot be installed because|bash is required to interpret this script/i.test(
      text,
    ) &&
    /HOMEBREW_|\/opt\/homebrew|\/usr\/local\/Homebrew|homebrew\/brew/i.test(text)
  ) {
    signals.push("homebrew-bootstrap-body");
  }
  if (
    /\bHOMEBREW_PREFIX\b|\bHOMEBREW_REPOSITORY\b|\bHOMEBREW_CELLAR\b/i.test(text) &&
    /git clone|github\.com\/Homebrew\/brew/i.test(text)
  ) {
    signals.push("homebrew-clones-brew-repo");
  }
  if (
    /\/opt\/homebrew\b|\/usr\/local\/bin\/brew\b/i.test(text) &&
    /sudo|NONINTERACTIVE|INTERACTIVE/i.test(text) &&
    /Homebrew/i.test(text)
  ) {
    signals.push("homebrew-system-prefix");
  }

  const hbSignals = signals.filter((s) => s.startsWith("homebrew-"));
  if (
    hbSignals.length >= 2 ||
    (signals.includes("homebrew-install-url") &&
      (signals.includes("homebrew-bootstrap-body") ||
        signals.includes("homebrew-clones-brew-repo") ||
        signals.includes("homebrew-system-prefix")))
  ) {
    return {
      kind: "system-wide-out-of-scope",
      packageHint: "homebrew",
      signals,
      reason:
        "Official Homebrew bootstrap (Homebrew/install install.sh) installs brew into " +
        "/opt/homebrew or /usr/local, requires sudo, and is the package manager itself. " +
        "It cannot be packaged as a Homebrew Cellar PREFIX install-script via allbrew " +
        "(meta-recursive). Install Homebrew with the upstream installer: " +
        "https://brew.sh — do not wrap install.sh as a formula.",
    };
  }

  // --- Official Nix multi-user ---
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
    (signals.includes("nixos-host") && signals.includes("nix-binary-tarball-installer"))
  ) {
    return {
      kind: "system-wide-out-of-scope",
      packageHint: "nix",
      signals,
      reason:
        "Official Nix installer is multi-user/system-wide (populates /nix, installs nix-daemon). " +
        "It cannot be packaged as a Homebrew Cellar PREFIX install-script. " +
        "Install Nix via the upstream installer (https://nixos.org/download/) outside allbrew; " +
        "Homebrew core also has no formula for nix.",
    };
  }

  // Home-dir installers (e.g. $HOME/.fly) — still may fail harvest; flag only.
  if (
    /\$HOME\/\.[A-Za-z0-9_.-]+|\$\{HOME\}\/\.[A-Za-z0-9_.-]+|FLYCTL_INSTALL|XDG_DATA_HOME/i.test(
      text,
    ) &&
    !/\bPREFIX\b|\bDESTDIR\b/i.test(text)
  ) {
    signals.push("home-dir-install");
    return {
      kind: "home-dir-installer",
      signals,
      reason: "Script installs under a user home directory rather than PREFIX/Cellar",
    };
  }

  return { kind: "prefix-ok", signals };
}

export function assertInstallScriptInScope(url: string, body: string): void {
  const analysis = analyzeInstallScript(url, body);
  if (analysis.kind === "system-wide-out-of-scope") {
    throw new Error(
      analysis.reason ||
        `Install script at ${url} is a system-wide installer and out of scope for allbrew`,
    );
  }
}
