import { createHash } from "node:crypto";
import { createWriteStream, readFileSync, mkdirSync, rmSync } from "node:fs";
import { Readable } from "node:stream";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { assertSafeFetchUrl } from "./utils.ts";

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 600_000;
const MAX_DOWNLOAD_BYTES = 2_000_000_000;
const MAX_REDIRECTS = 20;

/** Stable query key used to bypass CDN caches that poison bare paths. */
export const CACHE_BUST_PARAM = "allbrew_nocache";

/**
 * Some CDNs (e.g. qoder.com) return Location headers with an uppercase scheme
 * like `HTTPS://...`. Bun's fetch throws UnsupportedRedirectProtocol when
 * auto-following those. Resolve redirects manually and normalize the scheme.
 */
function normalizeFetchUrl(urlString: string, base?: string): string {
  const url = base ? new URL(urlString, base) : new URL(urlString);
  url.protocol = url.protocol.toLowerCase();
  return url.href;
}

/**
 * Detect incomplete full-file downloads.
 * Vercel (and similar CDNs) sometimes cache a 206 Partial response as the object
 * for the bare path: GET without Range returns 206 + tiny body (e.g. 16 bytes)
 * while Content-Range still advertises the full size. response.ok is true for 206,
 * so callers must reject these before hashing.
 */
export function incompleteDownloadReason(
  status: number,
  headers: { get(name: string): string | null } | null | undefined,
  bodySize: number,
): string | null {
  const get = (name: string) => {
    if (!headers || typeof headers.get !== "function") return null;
    return headers.get(name) ?? headers.get(name.toLowerCase());
  };
  const cr = get("content-range");

  if (status === 206) {
    if (cr) {
      const m = cr.match(/\/(\d+)\s*$/);
      if (m) {
        const total = Number(m[1]);
        if (Number.isFinite(total) && bodySize < total) {
          return `HTTP 206 partial body (${bodySize} bytes) is smaller than Content-Range total (${total} bytes)`;
        }
      }
    }
    return `HTTP 206 Partial Content returned for a full-file download (body ${bodySize} bytes)`;
  }

  if (cr) {
    const m = cr.match(/bytes\s+(\d+)-(\d+)\/(\d+)/i);
    if (m) {
      const total = Number(m[3]);
      const end = Number(m[2]);
      if (Number.isFinite(total) && bodySize < total && end + 1 < total) {
        return `Content-Range indicates incomplete body (${bodySize}/${total} bytes)`;
      }
    }
  }

  return null;
}

/**
 * Append a unique cache-bust query so a second GET hits a different CDN key.
 * Use a timestamp (not a stable `=1`) so a previously poisoned key is not reused;
 * Vercel has been observed to cache brotli bodies for a key after a br-capable
 * client warms it, then serve that body to curl which cannot decode it.
 */
export function withCacheBustQuery(url: string): string {
  const u = new URL(url);
  u.searchParams.set(
    CACHE_BUST_PARAM,
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  );
  return u.href;
}

/** Parse Content-Encoding codecs (comma-separated, case-insensitive). */
export function parseContentEncoding(
  header: string | null | undefined,
): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && s !== "identity");
}

/**
 * Homebrew downloads via curl without decoding content-codings. Fetch (Bun/undici)
 * auto-decompresses br/gzip. When they disagree, a generated formula/cask will fail
 * with "Cask reports different checksum" or install a corrupt archive.
 *
 * Skip with ALLBREW_SKIP_CURL_WIRE_CHECK=1 for offline unit tests.
 */
/**
 * Download with system curl the same way Homebrew does (no --compressed).
 * Returns null when curl is unavailable or the download fails.
 */
export function curlWireDownload(
  url: string,
  destPath: string,
  timeoutMs: number = 120_000,
): { sha256: string; size: number } | null {
  if (process.env.ALLBREW_SKIP_CURL_WIRE_CHECK === "1") return null;

  assertSafeFetchUrl(url);
  try {
    // No --compressed: match Homebrew curl (stores Content-Encoding body as-is).
    const r = spawnSync(
      "curl",
      [
        "-fsSL",
        "--max-time",
        String(Math.max(1, Math.ceil(timeoutMs / 1000))),
        "-A",
        "Homebrew",
        // Prefer identity so CDNs that honor it skip br/gzip for binary assets.
        "-H",
        "Accept-Encoding: identity",
        "-o",
        destPath,
        url,
      ],
      { encoding: "utf-8" },
    );
    if (r.status !== 0) return null;
    const buf = readFileSync(destPath);
    const sha256 = createHash("sha256").update(buf).digest("hex");
    return { sha256, size: buf.length };
  } catch {
    return null;
  }
}

export function curlWireSha256(
  url: string,
  timeoutMs: number = 120_000,
): { sha256: string; size: number } | null {
  if (process.env.ALLBREW_SKIP_CURL_WIRE_CHECK === "1") return null;

  const destDir = join(
    tmpdir(),
    `allbrew-curl-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  try {
    mkdirSync(destDir, { recursive: true });
    const dest = join(destDir, "wire.bin");
    return curlWireDownload(url, dest, timeoutMs);
  } catch {
    return null;
  } finally {
    try {
      rmSync(destDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/** True when a curl/fetch body looks like a real archive rather than a br stub or partial. */
export function isPlausibleArtifact(
  size: number,
  sample: Buffer | null,
  url: string,
): boolean {
  if (size < 4096) return false;
  if (!sample || sample.length < 4) return size >= 4096;
  const u = url.toLowerCase().split("?")[0];
  // Brotli stream often starts with non-ASCII; UDIF DMG often zlib-ish or has koly trailer.
  if (u.endsWith(".dmg") || u.endsWith(".pkg")) {
    if (sample.includes(Buffer.from("koly"))) return true;
    // zlib/deflate header or bare raw — accept large bodies that are not the known 16B partial
    if (size > 100_000) return true;
  }
  if (u.endsWith(".zip") && sample[0] === 0x50 && sample[1] === 0x4b) return true;
  return size > 100_000;
}

async function fetchFollowingRedirects(
  url: string,
  init: {
    headers?: HeadersInit;
    signal?: AbortSignal;
  },
): Promise<{ response: Response; finalUrl: string }> {
  let current = normalizeFetchUrl(url);

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    assertSafeFetchUrl(current);

    const response = await fetch(current, {
      redirect: "manual",
      headers: init.headers,
      signal: init.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error(
          `Redirect ${response.status} from ${current} without Location header`,
        );
      }
      try {
        await response.arrayBuffer();
      } catch {
        /* ignore */
      }
      current = normalizeFetchUrl(location, current);
      continue;
    }

    return { response, finalUrl: current };
  }

  throw new Error(`Too many redirects (max ${MAX_REDIRECTS}) for ${url}`);
}

async function readBodyAndHash(
  response: Response,
  destPath: string | null,
  urlForErrors: string,
): Promise<{ sha256: string; size: number; buffer: Buffer | null }> {
  const hash = createHash("sha256");
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  if (destPath) {
    const writeStream = createWriteStream(destPath);
    const body = Readable.fromWeb(response.body as any);

    try {
      for await (const chunk of body) {
        if (totalBytes + chunk.length > MAX_DOWNLOAD_BYTES) {
          throw new Error(
            `Download for ${urlForErrors} exceeds maximum size of ${MAX_DOWNLOAD_BYTES} bytes`,
          );
        }
        hash.update(chunk);
        writeStream.write(chunk);
        totalBytes += chunk.length;
      }

      writeStream.end();
      await new Promise((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      });
    } finally {
      body.destroy();
      writeStream.destroy();
    }
  } else {
    const body = Readable.fromWeb(response.body as any);
    try {
      for await (const chunk of body) {
        if (totalBytes + chunk.length > MAX_DOWNLOAD_BYTES) {
          throw new Error(
            `Download for ${urlForErrors} exceeds maximum size of ${MAX_DOWNLOAD_BYTES} bytes`,
          );
        }
        hash.update(chunk);
        chunks.push(chunk);
        totalBytes += chunk.length;
      }
    } finally {
      body.destroy();
    }
  }

  return {
    sha256: hash.digest("hex"),
    size: totalBytes,
    buffer: destPath ? null : Buffer.concat(chunks),
  };
}

type FetchHashResult = {
  sha256: string;
  size: number;
  buffer: Buffer | null;
  contentType: string;
  contentDisposition: string;
  versionHeader: string | null;
  finalUrl: string;
  status: number;
  incomplete: string | null;
  contentEncoding: string[];
};

async function fetchHashOnce(
  url: string,
  destPath: string | null,
  timeoutMs: number,
): Promise<FetchHashResult> {
  const { response, finalUrl } = await fetchFollowingRedirects(url, {
    headers: { "User-Agent": "allbrew/1.0" },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok && response.status !== 206) {
    throw new Error(
      `Failed to download ${url}: ${response.status} ${response.statusText}`,
    );
  }

  const hashed = await readBodyAndHash(response, destPath, url);
  const incomplete = incompleteDownloadReason(
    response.status,
    response.headers,
    hashed.size,
  );

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const contentDisposition = response.headers.get("content-disposition") || "";
  const contentEncoding = parseContentEncoding(
    response.headers.get("content-encoding"),
  );
  const versionHeader =
    response.headers.get("x-halo-version") ||
    response.headers.get("x-version") ||
    response.headers.get("x-app-version") ||
    "";

  return {
    ...hashed,
    contentType,
    contentDisposition,
    versionHeader: versionHeader || null,
    finalUrl,
    status: response.status,
    incomplete,
    contentEncoding,
  };
}

function wireMismatchMessage(
  url: string,
  fetchSha: string,
  curlSha: string,
  encoding: string[],
): string {
  const enc = encoding.length ? encoding.join(", ") : "unknown";
  return (
    `Content-Encoding: ${enc} on ${url} causes a fetch/curl SHA-256 mismatch ` +
    `(fetch/decompressed=${fetchSha}, curl/wire=${curlSha}). ` +
    `Homebrew downloads with curl without decoding content-codings, so a generated ` +
    `formula/cask would fail with "Cask reports different checksum" (or install a corrupt archive). ` +
    `Disable CDN content-compression for this binary asset, or provide a direct uncompressed download URL.`
  );
}

function looksLikeBinaryArchive(
  url: string,
  contentType: string,
  contentDisposition: string,
): boolean {
  const u = url.toLowerCase().split("?")[0];
  if (/\.(dmg|zip|pkg|tar\.gz|tgz|tar\.bz2|tar\.xz|7z)$/i.test(u)) return true;
  if (/filename[^;]*\.(dmg|zip|pkg)/i.test(contentDisposition)) return true;
  if (contentType.includes("application/x-apple-diskimage")) return true;
  if (contentType.includes("application/zip")) return true;
  if (
    contentType.includes("application/octet-stream") &&
    /\.dmg/i.test(contentDisposition + u)
  ) {
    return true;
  }
  return false;
}

function sampleArtifact(path: string, size: number): Buffer | null {
  try {
    const full = readFileSync(path);
    if (full.includes(Buffer.from("koly"))) {
      return Buffer.concat([full.subarray(0, Math.min(64, full.length)), Buffer.from("koly")]);
    }
    return full.subarray(0, Math.min(size, 512 * 1024));
  } catch {
    return null;
  }
}

function resultFromCurl(
  curl: { sha256: string; size: number },
  finalUrl: string,
  first: FetchHashResult,
): FetchHashResult {
  return {
    sha256: curl.sha256,
    size: curl.size,
    buffer: null,
    contentType: first.contentType,
    contentDisposition: first.contentDisposition,
    versionHeader: first.versionHeader,
    finalUrl,
    status: 200,
    incomplete: null,
    contentEncoding: [],
  };
}

/**
 * Align download URL + SHA with Homebrew curl.
 *
 * Fetch (Bun/undici) auto-decompresses Content-Encoding; Homebrew's curl stores
 * the wire body. Bun often strips Content-Encoding after decompress, so we cannot
 * rely on that header alone — for binary archives we always probe curl.
 *
 * On mismatch / incomplete / non-plausible curl body, re-download via curl on a
 * unique `?allbrew_nocache=` URL (cold CDN key; identity encoding on Vercel).
 */
async function ensureHomebrewCompatible(
  url: string,
  destPath: string | null,
  timeoutMs: number,
  first: FetchHashResult,
): Promise<FetchHashResult> {
  const binary = looksLikeBinaryArchive(
    first.finalUrl || url,
    first.contentType,
    first.contentDisposition,
  );

  // Non-binary, complete: keep fetch result (optional soft wire check only).
  if (!binary && !first.incomplete) {
    const soft = curlWireSha256(first.finalUrl, timeoutMs);
    if (soft && soft.sha256 !== first.sha256) {
      throw new Error(
        wireMismatchMessage(
          first.finalUrl,
          first.sha256,
          soft.sha256,
          first.contentEncoding,
        ),
      );
    }
    return first;
  }

  // --- Binary (or incomplete) path: curl is source of truth for Homebrew ---
  const tryCurlUrl = (candidate: string): FetchHashResult | null => {
    if (destPath) {
      const via = curlWireDownload(candidate, destPath, timeoutMs);
      if (!via) return null;
      const sample = sampleArtifact(destPath, via.size);
      if (!isPlausibleArtifact(via.size, sample, candidate)) return null;
      return resultFromCurl(via, candidate, first);
    }
    const via = curlWireSha256(candidate, timeoutMs);
    if (!via || !isPlausibleArtifact(via.size, null, candidate)) return null;
    return resultFromCurl(via, candidate, first);
  };

  // 1) curl bare URL (matches what Homebrew would fetch today)
  if (!first.incomplete) {
    const bare = tryCurlUrl(first.finalUrl || url);
    if (bare && bare.sha256 === first.sha256) {
      // Wire matches fetch — bare URL is safe.
      return { ...first, finalUrl: first.finalUrl || url, contentEncoding: [] };
    }
    // bare curl differs or not plausible — need a cold CDN key
  }

  // 2) unique cache-bust + curl FIRST (do not fetch-with-br this key)
  const busted = withCacheBustQuery(url);
  const cold = tryCurlUrl(busted);
  if (cold) {
    return cold;
  }

  // 3) curl unavailable (unit tests / offline): fetch the busted URL as fallback
  if (process.env.ALLBREW_SKIP_CURL_WIRE_CHECK === "1") {
    const second = await fetchHashOnce(busted, destPath, timeoutMs);
    if (!second.incomplete) {
      return second;
    }
    throw new Error(
      `Incomplete download for ${url}: ${second.incomplete}. ` +
        `CDN may be serving a cached Partial Content body; disable range-response caching for this binary or provide a direct uncompressed URL.`,
    );
  }

  // 4) incomplete with no recovery
  if (first.incomplete) {
    throw new Error(
      `Incomplete download for ${url}: ${first.incomplete}. ` +
        `CDN may be serving a cached Partial Content body; disable range-response caching for this binary or provide a direct uncompressed URL.`,
    );
  }

  // 5) last resort: fetch body — refuse if curl disagrees when available
  const wireLast = curlWireSha256(first.finalUrl, timeoutMs);
  if (wireLast && wireLast.sha256 !== first.sha256) {
    throw new Error(
      wireMismatchMessage(
        first.finalUrl,
        first.sha256,
        wireLast.sha256,
        first.contentEncoding,
      ),
    );
  }

  // curl unavailable — keep fetch (unit tests / offline)
  return first;
}

export async function downloadAndHash(
  url: string,
  destPath: string | null = null,
  timeoutMs: number = DEFAULT_DOWNLOAD_TIMEOUT_MS,
) {
  const first = await fetchHashOnce(url, destPath, timeoutMs);
  const result = await ensureHomebrewCompatible(url, destPath, timeoutMs, first);

  return {
    sha256: result.sha256,
    size: result.size,
    buffer: result.buffer,
    contentType: result.contentType,
    contentDisposition: result.contentDisposition,
    versionHeader: result.versionHeader,
    finalUrl: result.finalUrl,
    contentEncoding: result.contentEncoding,
  };
}

export async function hashUrl(url: string) {
  const { sha256 } = await downloadAndHash(url);
  return sha256;
}

/** Parse filename= from Content-Disposition (RFC 6266 / simple forms). */
export function filenameFromContentDisposition(disp: string | null | undefined): string | null {
  if (!disp) return null;
  const utf8 = disp.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].trim().replace(/^["']|["']$/g, ""));
    } catch {
      return utf8[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  const plain = disp.match(/filename\s*=\s*("?)([^";]+)\1/i);
  if (plain?.[2]) return plain[2].trim();
  return null;
}

export async function downloadToTemp(
  url: string,
  filename: string | null = null,
  timeoutMs: number = DEFAULT_DOWNLOAD_TIMEOUT_MS,
) {
  const tempDir = await mkdtemp(join(tmpdir(), "allbrew-"));
  // Prefer caller filename; otherwise use a neutral name so extensionless APIs
  // are not written as bare "latest" without a type suffix.
  const fname = filename || url.split("/").pop().split("?")[0] || "download";
  const destPath = join(tempDir, fname);
  const result = await downloadAndHash(url, destPath, timeoutMs);

  // If the server told us the real filename (HaloMac-latest.dmg), rename for
  // downstream detectors that key off path extensions.
  let path = destPath;
  const serverName = filenameFromContentDisposition(result.contentDisposition);
  if (serverName && /\.(dmg|zip|pkg)$/i.test(serverName) && !filename) {
    try {
      const { rename } = await import("node:fs/promises");
      const better = join(tempDir, serverName.replace(/[/\\]/g, "_"));
      await rename(destPath, better);
      path = better;
    } catch {
      /* keep destPath */
    }
  } else if (
    !/\.(dmg|zip|pkg)$/i.test(fname) &&
    (result.contentType || "").includes("application/x-apple-diskimage")
  ) {
    try {
      const { rename } = await import("node:fs/promises");
      const better = join(tempDir, `${fname}.dmg`);
      await rename(destPath, better);
      path = better;
    } catch {
      /* keep destPath */
    }
  }

  const cleanup = async () => {
    await rm(tempDir, { recursive: true, force: true });
  };

  return {
    ...result,
    path,
    dir: tempDir,
    cleanup,
    serverFilename: serverName,
  };
}
