import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { assertSafeFetchUrl } from "./utils.ts";

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 600_000;
const MAX_DOWNLOAD_BYTES = 2_000_000_000;
const MAX_REDIRECTS = 20;

/** Content-codings that fetch runtimes may auto-decode but Homebrew/curl store as wire bytes. */
const WIRE_MISMATCH_CODECS = new Set([
  "br",
  "gzip",
  "x-gzip",
  "deflate",
  "zstd",
]);

/**
 * Parse Content-Encoding into codec tokens (ignores parameters / identity).
 * Exported for unit tests.
 */
export function parseContentEncodingCodecs(
  header: string | null | undefined,
): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => part.trim().split(";")[0].trim().toLowerCase())
    .filter((c) => c && c !== "identity" && WIRE_MISMATCH_CODECS.has(c));
}

/**
 * Homebrew downloads via curl without `--compressed`, so content-codings stay
 * on the wire. Bun/Node fetch typically decode them. When those hashes diverge,
 * any sha256 we embed will fail `brew install`. Probe curl's wire body (best
 * effort) and throw a clear vendor/CDN error when they differ.
 */
async function assertFetchMatchesCurlWire(
  url: string,
  fetchSha256: string,
  codecs: string[],
  timeoutMs: number,
): Promise<void> {
  if (codecs.length === 0) return;
  if (process.env.ALLBREW_SKIP_CURL_WIRE_CHECK === "1") return;

  const wireSha = curlWireSha256(url, timeoutMs);
  if (!wireSha) return; // curl unavailable / failed — do not block offline unit tests
  if (wireSha === fetchSha256) return;

  throw new Error(
    `Content-Encoding: ${codecs.join(", ")} on ${url} causes a fetch/curl SHA-256 mismatch ` +
      `(fetch/decompressed=${fetchSha256}, curl/wire=${wireSha}). ` +
      `Homebrew downloads with curl without decoding content-codings, so a generated formula/cask ` +
      `would fail with "Cask reports different checksum" (or install a corrupt archive). ` +
      `Disable CDN content-compression for this binary asset, or provide a direct uncompressed download URL.`,
  );
}

/** SHA-256 of the body curl stores (no --compressed). null if curl cannot run. */
export function curlWireSha256(
  url: string,
  timeoutMs: number = DEFAULT_DOWNLOAD_TIMEOUT_MS,
): string | null {
  try {
    assertSafeFetchUrl(url);
  } catch {
    return null;
  }

  const maxTime = Math.max(5, Math.ceil(timeoutMs / 1000));
  // Stream body to sha256 via shasum/openssl; avoid large temp files when possible.
  const shell = `curl -fsSL --max-time ${maxTime} -A "allbrew/1.0" --proto-redir =https ${shellQuote(url)} | shasum -a 256 | awk '{print $1}'`;
  const result = spawnSync("sh", ["-c", shell], {
    encoding: "utf-8",
    timeout: timeoutMs + 5_000,
    maxBuffer: 2_000_000,
  });
  if (result.status !== 0) return null;
  const hex = (result.stdout || "").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

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

async function fetchFollowingRedirects(
  url: string,
  init: {
    headers?: HeadersInit;
    signal?: AbortSignal;
  },
): Promise<Response> {
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
      // Consume/cancel body so the connection can be reused.
      try {
        await response.arrayBuffer();
      } catch {
        /* ignore */
      }
      current = normalizeFetchUrl(location, current);
      continue;
    }

    return response;
  }

  throw new Error(`Too many redirects (max ${MAX_REDIRECTS}) for ${url}`);
}

export async function downloadAndHash(
  url: string,
  destPath: string | null = null,
  timeoutMs: number = DEFAULT_DOWNLOAD_TIMEOUT_MS,
) {
  const response = await fetchFollowingRedirects(url, {
    headers: { "User-Agent": "allbrew/1.0" },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download ${url}: ${response.status} ${response.statusText}`,
    );
  }

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
            `Download for ${url} exceeds maximum size of ${MAX_DOWNLOAD_BYTES} bytes`,
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
            `Download for ${url} exceeds maximum size of ${MAX_DOWNLOAD_BYTES} bytes`,
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

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const contentDisposition = response.headers.get("content-disposition") || "";
  const contentEncoding = response.headers.get("content-encoding") || "";
  // Vendor version headers (e.g. Halo `x-halo-version: 0.6.0`)
  const versionHeader =
    response.headers.get("x-halo-version") ||
    response.headers.get("x-version") ||
    response.headers.get("x-app-version") ||
    "";

  const sha256 = hash.digest("hex");
  const codecs = parseContentEncodingCodecs(contentEncoding);
  await assertFetchMatchesCurlWire(url, sha256, codecs, timeoutMs);

  return {
    sha256,
    size: totalBytes,
    buffer: destPath ? null : Buffer.concat(chunks),
    contentType,
    contentDisposition,
    contentEncoding: contentEncoding || null,
    versionHeader: versionHeader || null,
    finalUrl: response.url || url,
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
