import { toCaskToken, rubyEscape } from "../utils.ts";
import type { MasAppPayload } from "../template-payload.ts";
import { writeRenderedCask } from "../template-renderer.ts";
import { masAppLivecheckBlock } from "./livecheck.ts";

export async function collectMasAppPayload(
  appStoreUrl: string,
  options: any = {},
): Promise<MasAppPayload> {
  const appId = extractAppId(appStoreUrl);
  if (!appId) {
    throw new Error(`Could not extract App Store ID from URL: ${appStoreUrl}`);
  }

  const metadata = await fetchAppMetadata(appId);

  const name = options.name || toCaskToken(metadata.trackName);
  const appName = metadata.trackName;
  const desc =
    options.desc ||
    metadata.description?.split("\n")[0]?.slice(0, 100) ||
    `Install ${appName} from the Mac App Store`;
  const homepage = metadata.sellerUrl || appStoreUrl;
  const version = metadata.version;
  const bundleId = metadata.bundleId;

  return {
    template: "mas_app",
    name,
    appId,
    appName: rubyEscape(appName),
    version: rubyEscape(version),
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    zapBlock: buildZapBlock(appName, bundleId),
    livecheckBlock: masAppLivecheckBlock(appId),
  };
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

export async function generateMasApp(appStoreUrl: string, options: any = {}) {
  const payload = await collectMasAppPayload(appStoreUrl, options);
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

  return data.results[0];
}
