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
  options: { userAgent?: string; headers?: Record<string, string> } = {},
) {
  const userAgent = options.userAgent || "allbrew/1.0";
  const response = await fetchFollowingRedirects(url, {
    headers: { "User-Agent": userAgent, ...(options.headers || {}) },
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

  return {
    sha256: hash.digest("hex"),
    size: totalBytes,
    buffer: destPath ? null : Buffer.concat(chunks),
  };
}

export async function hashUrl(url: string) {
  const { sha256 } = await downloadAndHash(url);
  return sha256;
}

export async function downloadToTemp(
  url: string,
  filename: string | null = null,
  timeoutMs: number = DEFAULT_DOWNLOAD_TIMEOUT_MS,
) {
  const tempDir = await mkdtemp(join(tmpdir(), "allbrew-"));
  const fname = filename || url.split("/").pop().split("?")[0] || "download";
  const destPath = join(tempDir, fname);
  const result = await downloadAndHash(url, destPath, timeoutMs);

  const cleanup = async () => {
    await rm(tempDir, { recursive: true, force: true });
  };

  return { ...result, path: destPath, dir: tempDir, cleanup };
}
