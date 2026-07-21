import { rubyString } from "../utils.ts";

export function npmLivecheckBlock(packageName) {
  if (!packageName) return "";
  const base = process.env.NPM_REGISTRY_URL || "https://registry.npmjs.org";

  return jsonRegexLivecheckBlock(
    `${base}/${encodeURIComponent(packageName)}/latest`,
    /"version"\s*:\s*"v?([^"\\]+)"/i,
  );
}

export function pypiLivecheckBlock(packageName) {
  if (!packageName) return "";
  const base = process.env.PYPI_URL || "https://pypi.org";

  return jsonRegexLivecheckBlock(
    `${base}/pypi/${encodeURIComponent(packageName)}/json`,
    /"version"\s*:\s*"v?([^"\\]+)"/i,
  );
}

export function cratesLivecheckBlock(crateName) {
  if (!crateName) return "";
  const base = process.env.CRATES_URL || "https://crates.io";

  return jsonRegexLivecheckBlock(
    `${base}/api/v1/crates/${encodeURIComponent(crateName)}`,
    /"(?:max_stable_version|newest_version)"\s*:\s*"v?([^"\\]+)"/i,
  );
}

export function goModuleLivecheckBlock(modulePath) {
  if (!modulePath) return "";
  const base = process.env.GO_PROXY_URL || "https://proxy.golang.org";

  return jsonRegexLivecheckBlock(
    `${base}/${modulePath}/@latest`,
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
  return (
    `  livecheck do\n` +
    `    url ${rubyString(url)}\n` +
    `    strategy :header_match\n` +
    `    regex(/(\\d+(?:\\.\\d+)+)/)\n` +
    `  end\n\n`
  );
}

export function masAppLivecheckBlock(appId: string) {
  if (!appId) return "";
  return jsonRegexLivecheckBlock(
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(appId)}`,
    /"version"\s*:\s*"([^"]+)"/i,
  );
}


export function setappAppLivecheckBlock(slug: string) {
  if (!slug) return "";
  return jsonRegexLivecheckBlock(
    `https://setapp.com/apps/${encodeURIComponent(slug)}`,
    /Version\s+(\d+(?:\.\d+)+)/i,
  );
}
