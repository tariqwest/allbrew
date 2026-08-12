import { toCaskToken, rubyEscape } from "../utils.ts";
import type { CaskAppMasPayload } from "../template-payload.ts";
import { writeRenderedCask } from "../template-renderer.ts";
import { masAppLivecheckBlock } from "./livecheck.ts";

export async function collectCaskAppMasPayload(
  appStoreUrl: string,
  options: any = {},
): Promise<CaskAppMasPayload> {
  const appId = extractAppId(appStoreUrl);
  if (!appId) {
    throw new Error(`Could not extract App Store ID from URL: ${appStoreUrl}`);
  }

  const metadata = await fetchAppMetadata(appId);

  const name = options.name || toCaskToken(metadata.trackName);
  const appName = metadata.trackName;
  // trackName often includes a subtitle ("Bear: Markdown Notes") while the
  // on-disk bundle is just the product stem ("Bear.app").
  const appBundleName =
    options.appBundleName || appBundleNameFromTrack(appName);
  const desc =
    options.desc ||
    metadata.description?.split("\n")[0]?.slice(0, 100) ||
    `Install ${appName} from the Mac App Store`;
  const homepage = metadata.sellerUrl || appStoreUrl;
  const version = metadata.version;
  const bundleId = metadata.bundleId;

  return {
    template: "cask_app_mas",
    name,
    appId,
    appName: rubyEscape(appName),
    appBundleName: rubyEscape(appBundleName),
    version: rubyEscape(version),
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    zapBlock: buildZapBlock(appBundleName, bundleId),
    livecheckBlock: masAppLivecheckBlock(appId),
  };
}

/** Derive /Applications/*.app stem from iTunes trackName. */
export function appBundleNameFromTrack(trackName: string): string {
  const raw = String(trackName || "").trim();
  if (!raw) return "App";
  // "Bear: Markdown Notes" → "Bear"; "Foo - Bar" kept if no colon
  const beforeColon = raw.split(":")[0].trim();
  return beforeColon || raw;
}

function buildZapBlock(appName: string, bundleId: string | null) {
  let block = "  zap trash: [\n";
  if (bundleId) {
    block += `    "~/Library/Application Support/${rubyEscape(appName)}",\n`;
    block += `    "~/Library/Caches/${rubyEscape(bundleId)}",\n`;
    block += `    "~/Library/Preferences/${rubyEscape(bundleId)}.plist",\n`;
    block += `    "~/Library/Saved Application State/${rubyEscape(bundleId)}.savedState",\n`;
  } else {
    block += `    "~/Library/Application Support/${rubyEscape(appName)}",\n`;
  }
  block += "  ]\n";
  return block;
}

export async function generateCaskAppMas(appStoreUrl: string, options: any = {}) {
  const payload = await collectCaskAppMasPayload(appStoreUrl, options);
  const result = await writeRenderedCask(payload, options.tapPath);
  return { ...result, appId: payload.appId, appName: payload.appName };
}

function extractAppId(url: string) {
  const match = url.match(/\/id(\d+)/);
  return match ? match[1] : null;
}

async function fetchAppMetadata(appId: string) {
  const response = await fetch(`https://itunes.apple.com/lookup?id=${appId}`, {
    headers: { "User-Agent": "allbrew/1.0" },
  });

  if (!response.ok) {
    throw new Error(`iTunes Lookup API failed: ${response.status}`);
  }

  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    throw new Error(`No app found with ID ${appId}`);
  }

  const result = data.results[0];
  // Reject iPhone/iPad software so we never emit a Mac cask for an iOS App Store ID
  // (kind "software" = iOS; "mac-software" = Mac App Store).
  const kind = String(result.kind || "");
  if (kind && kind !== "mac-software") {
    throw new Error(
      `App Store ID ${appId} is not Mac software (kind=${kind}); refuse iOS App Store links for cask-app-mas`,
    );
  }

  return result;
}
