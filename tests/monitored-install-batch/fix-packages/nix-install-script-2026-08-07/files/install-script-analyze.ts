/**
 * Inspect vendor install scripts before generating an install-script formula.
 * Some scripts are system-wide (Nix multi-user, rootful /nix) and cannot be
 * expressed as Cellar PREFIX installs — reject with a clear out-of-scope error.
 */

export type InstallScriptAnalysis = {
  kind: "prefix-ok" | "system-wide-out-of-scope" | "home-dir-installer";
  reason?: string;
  packageHint?: string;
  signals: string[];
};

const NIX_URL_RE =
  /(?:^|\/\/)(?:(?:www|releases)\.)?nixos\.org\/|(?:^|\/\/)nixos\.org\/nix\/install/i;

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
