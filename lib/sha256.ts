import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";

export async function downloadAndHash(
  url: string,
  destPath: string | null = null,
) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "allbrew/1.0" },
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

    for await (const chunk of body) {
      hash.update(chunk);
      writeStream.write(chunk);
      totalBytes += chunk.length;
    }

    writeStream.end();
    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });
  } else {
    const body = Readable.fromWeb(response.body as any);
    for await (const chunk of body) {
      hash.update(chunk);
      chunks.push(chunk);
      totalBytes += chunk.length;
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
) {
  const tempDir = await mkdtemp(join(tmpdir(), "allbrew-"));
  const fname = filename || url.split("/").pop().split("?")[0] || "download";
  const destPath = join(tempDir, fname);
  const result = await downloadAndHash(url, destPath);
  return { ...result, path: destPath, dir: tempDir };
}
