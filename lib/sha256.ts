import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { assertSafeFetchUrl } from "./utils.ts";

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 600_000;
const MAX_DOWNLOAD_BYTES = 2_000_000_000;
const MAX_REDIRECTS = 20;

/**
 * Some CDNs (e.g. qoder.com) return Location headers with an uppercase scheme
 * like `HTTPS://...`. Bun's fetch throws UnsupportedRedirectProtocol when
 * auto-following those. Resolve redirects manually and normalize the scheme.
 */
export function normalizeFetchUrl(urlString: string, base?: string): string {
  const url = base ? new URL(urlString, base) : new URL(urlString);
  url.protocol = url.protocol.toLowerCase();
  return url.href;
}

/**
 * Follow HTTP redirects manually, normalizing Location schemes.
 * Returns the final non-redirect response and the final absolute URL.
 */
export async function fetchFollowingRedirects(
  url: string,
  init: {
    headers?: HeadersInit;
    signal?: AbortSignal;
    method?: string;
  } = {},
): Promise<{ response: Response; finalUrl: string }> {
  let current = normalizeFetchUrl(url);

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    assertSafeFetchUrl(current);

    const response = await fetch(current, {
      method: init.method || "GET",
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

    return { response, finalUrl: current };
  }

  throw new Error(`Too many redirects (max ${MAX_REDIRECTS}) for ${url}`);
}

export async function downloadAndHash(
  url: string,
  destPath: string | null = null,
  timeoutMs: number = DEFAULT_DOWNLOAD_TIMEOUT_MS,
) {
  const { response, finalUrl } = await fetchFollowingRedirects(url, {
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

  const headers = response.headers;
  const headerGet = (name: string) =>
    headers && typeof headers.get === "function" ? headers.get(name) : null;
  const contentType = (headerGet("content-type") || "").toLowerCase();
  const contentDisposition = headerGet("content-disposition") || "";
  // Vendor version headers (e.g. Halo `x-halo-version: 0.6.0`)
  const versionHeader =
    headerGet("x-halo-version") ||
    headerGet("x-version") ||
    headerGet("x-app-version") ||
    "";

  return {
    sha256: hash.digest("hex"),
    size: totalBytes,
    buffer: destPath ? null : Buffer.concat(chunks),
    contentType,
    contentDisposition,
    versionHeader: versionHeader || null,
    finalUrl: finalUrl || response.url || url,
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
