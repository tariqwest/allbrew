import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 600_000;
const MAX_DOWNLOAD_BYTES = 2_000_000_000;

export async function downloadAndHash(
  url: string,
  destPath: string | null = null,
  timeoutMs: number = DEFAULT_DOWNLOAD_TIMEOUT_MS,
) {
  const response = await fetch(url, {
    redirect: "follow",
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
