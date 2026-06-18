import { rubyString } from "../utils.ts";

export function npmLivecheckBlock(packageName) {
  if (!packageName) return "";

  return jsonRegexLivecheckBlock(
    `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
    /"version"\s*:\s*"v?([^"\\]+)"/i,
  );
}

export function pypiLivecheckBlock(packageName) {
  if (!packageName) return "";

  return jsonRegexLivecheckBlock(
    `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`,
    /"version"\s*:\s*"v?([^"\\]+)"/i,
  );
}

export function cratesLivecheckBlock(crateName) {
  if (!crateName) return "";

  return jsonRegexLivecheckBlock(
    `https://crates.io/api/v1/crates/${encodeURIComponent(crateName)}`,
    /"(?:max_stable_version|newest_version)"\s*:\s*"v?([^"\\]+)"/i,
  );
}

export function goModuleLivecheckBlock(modulePath) {
  if (!modulePath) return "";

  return jsonRegexLivecheckBlock(
    `https://proxy.golang.org/${modulePath}/@latest`,
    /"Version"\s*:\s*"v?([^"\\]+)"/i,
  );
}

function jsonRegexLivecheckBlock(url, regex) {
  return (
    `  livecheck do\n` +
    `    url ${rubyString(url)}\n` +
    `    regex(${regex.toString()})\n` +
    `  end\n\n`
  );
}

export function githubLatestLivecheckBlock() {
  return (
    `  livecheck do\n` +
    `    url :head\n` +
    `    strategy :github_latest\n` +
    `  end\n\n`
  );
}

export function urlVersionLivecheckBlock(url: string) {
  if (!url) return "";
  return jsonRegexLivecheckBlock(
    url,
    /[\/-]v?(\d+(?:\.\d+)+)/i,
  );
}

export function masAppLivecheckBlock(appId: string) {
  if (!appId) return "";
  return jsonRegexLivecheckBlock(
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(appId)}`,
    /"version"\s*:\s*"([^"]+)"/i,
  );
}
