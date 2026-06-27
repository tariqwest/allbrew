import { toCaskToken, rubyEscape } from "../utils.ts";
import type { CaskAppSetappPayload } from "../template-payload.ts";
import { writeRenderedCask } from "../template-renderer.ts";
import { setappAppLivecheckBlock } from "./livecheck.ts";

export function extractSetappSlug(url: string) {
  const match = url.match(/setapp\.com\/apps\/([^/?#]+)/i);
  return match ? match[1] : null;
}

export function parseSetappPage(html: string, slug: string, homepage: string) {
  const appNameMatch = html.match(/<h1[^>]*>\s*([^<]+?)\s*<\/h1>/i);
  const versionMatch = html.match(/Version\s+(\d+(?:\.\d+)+)/i);
  const metaDescMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);

  const appName = appNameMatch?.[1]?.trim();
  if (!appName) {
    throw new Error(`Could not extract app name from Setapp page: ${homepage}`);
  }

  const version = versionMatch?.[1] || "0.0.0";
  const desc =
    metaDescMatch?.[1]?.trim() || `Install ${appName} from Setapp`;

  return { appName, version, desc, slug, homepage };
}

export async function setappLatestVersion(slug: string) {
  const metadata = await fetchSetappMetadata(slug);
  return metadata.version;
}

async function fetchSetappMetadata(slug: string) {
  const homepage = `https://setapp.com/apps/${slug}`;
  const response = await fetch(homepage, {
    headers: { "User-Agent": "allbrew/1.0" },
  });

  if (!response.ok) {
    throw new Error(`Setapp page fetch failed: ${response.status}`);
  }

  const html = await response.text();
  return parseSetappPage(html, slug, homepage);
}

function buildZapBlock(appName: string) {
  return (
    "  zap trash: [\n" +
    `    "~/Library/Application Support/${rubyEscape(appName)}",\n` +
    "  ]\n"
  );
}

export async function collectCaskAppSetappPayload(
  setappUrl: string,
  options: any = {},
): Promise<CaskAppSetappPayload> {
  const slug = extractSetappSlug(setappUrl);
  if (!slug) {
    throw new Error(`Could not extract Setapp slug from URL: ${setappUrl}`);
  }

  const metadata = await fetchSetappMetadata(slug);
  const name = options.name || toCaskToken(slug);
  const appName = metadata.appName;
  const desc =
    options.desc || metadata.desc.split("\n")[0]?.slice(0, 100) || metadata.desc;
  const homepage = metadata.homepage;
  const version = metadata.version;

  return {
    template: "cask_app_setapp",
    name,
    slug,
    appName: rubyEscape(appName),
    version: rubyEscape(version),
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    zapBlock: buildZapBlock(appName),
    livecheckBlock: setappAppLivecheckBlock(slug),
  };
}

export async function generateCaskAppSetapp(setappUrl: string, options: any = {}) {
  const payload = await collectCaskAppSetappPayload(setappUrl, options);
  const result = await writeRenderedCask(payload, options.tapPath);
  return {
    ...result,
    slug: payload.slug,
    appName: payload.appName,
    recordedVersion: payload.version,
  };
}
