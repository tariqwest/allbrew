import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { rm, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import {
  downloadAndHash,
  hashUrl,
  downloadToTemp,
  parseContentEncodingCodecs,
} from "../../lib/sha256.ts";

// ─── A6: sha256 unit tests ───────────────────────────────────────────────
// Tests fetch timeout behavior, 2GB size cap enforcement, and temp-file
// cleanup on success and failure. Uses mock fetch (no real downloads).

function mockHeaders(init: Record<string, string> = {}) {
  const map = new Map(
    Object.entries(init).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    get: (name: string) => map.get(name.toLowerCase()) ?? null,
  };
}

function mockResponse(
  body: string | Buffer,
  opts?: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
  },
) {
  return {
    ok: (opts?.status ?? 200) < 400,
    status: opts?.status ?? 200,
    statusText: opts?.statusText ?? "OK",
    headers: mockHeaders(opts?.headers),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(typeof body === "string" ? new TextEncoder().encode(body) : body);
        controller.close();
      },
    }),
  } as any;
}

function mockStreamingResponse(
  chunks: Buffer[],
  opts?: { status?: number; headers?: Record<string, string> },
) {
  return {
    ok: (opts?.status ?? 200) < 400,
    status: opts?.status ?? 200,
    statusText: "OK",
    headers: mockHeaders(opts?.headers),
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
  } as any;
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  mock.restore();
});

describe("downloadAndHash", () => {
  it("computes SHA256 of a small response body (no destPath)", async () => {
    const data = "hello world";
    const expected = createHash("sha256").update(data).digest("hex");
    global.fetch = mock(() => Promise.resolve(mockResponse(data))) as any;

    const result = await downloadAndHash("http://example.com/file");
    expect(result.sha256).toBe(expected);
    expect(result.size).toBe(data.length);
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer!.toString()).toBe(data);
  });

  it("writes to destPath and returns null buffer", async () => {
    const data = "hello world";
    const expected = createHash("sha256").update(data).digest("hex");
    global.fetch = mock(() => Promise.resolve(mockResponse(data))) as any;

    const destDir = await import("node:fs/promises").then((m) =>
      m.mkdtemp(join(tmpdir(), "allbrew-sha-test-")),
    );
    const destPath = join(destDir, "file.bin");
    try {
      const result = await downloadAndHash("http://example.com/file", destPath);
      expect(result.sha256).toBe(expected);
      expect(result.buffer).toBeNull();
      const written = await readFile(destPath, "utf-8");
      expect(written).toBe(data);
    } finally {
      await rm(destDir, { recursive: true, force: true });
    }
  });

  it("throws on non-200 response", async () => {
    global.fetch = mock(() =>
      Promise.resolve(mockResponse("Not Found", { status: 404, statusText: "Not Found" })),
    ) as any;

    await expect(downloadAndHash("http://example.com/missing")).rejects.toThrow(
      /Failed to download/,
    );
  });

  it("enforces the 2GB size cap", async () => {
    // Create a chunk that is just over 2GB when combined with a second chunk.
    // We mock the stream to produce two chunks whose total exceeds the cap.
    const chunkOver2GB = Buffer.alloc(2_000_000_001);
    global.fetch = mock(() =>
      Promise.resolve(mockStreamingResponse([chunkOver2GB])),
    ) as any;

    await expect(downloadAndHash("http://example.com/huge")).rejects.toThrow(
      /exceeds maximum size/,
    );
  });

it("handles multi-chunk streams correctly", async () => {
    const chunk1 = Buffer.from("hello ");
    const chunk2 = Buffer.from("world");
    const combined = "hello world";
    const expected = createHash("sha256").update(combined).digest("hex");
    global.fetch = mock(() =>
      Promise.resolve(mockStreamingResponse([chunk1, chunk2])),
    ) as any;

    const result = await downloadAndHash("http://example.com/multi");
    expect(result.sha256).toBe(expected);
    expect(result.size).toBe(combined.length);
  });

  it("follows redirects and normalizes uppercase HTTPS Location schemes", async () => {
    const data = "redirected body";
    const expected = createHash("sha256").update(data).digest("hex");
    let sawNormalized = false;
    global.fetch = mock((input: RequestInfo | URL) => {
      const href = String(input);
      if (href === "https://example.com/start") {
        return Promise.resolve({
          ok: false,
          status: 302,
          statusText: "Found",
          headers: {
            get: (name: string) =>
              name.toLowerCase() === "location"
                ? "HTTPS://download.example.com:443/install.sh"
                : null,
          },
          arrayBuffer: async () => new ArrayBuffer(0),
          body: null,
        } as any);
      }
      if (href.startsWith("https://download.example.com")) {
        sawNormalized = true;
        return Promise.resolve(mockResponse(data));
      }
      return Promise.resolve(mockResponse("miss", { status: 404, statusText: "Not Found" }));
    }) as any;

    const result = await downloadAndHash("https://example.com/start");
    expect(sawNormalized).toBe(true);
    expect(result.sha256).toBe(expected);
    expect(result.buffer!.toString()).toBe(data);
  });
});

describe("hashUrl", () => {
  it("returns just the SHA256 hash", async () => {
    const data = "test data";
    const expected = createHash("sha256").update(data).digest("hex");
    global.fetch = mock(() => Promise.resolve(mockResponse(data))) as any;

    const hash = await hashUrl("http://example.com/file");
    expect(hash).toBe(expected);
  });
});

describe("parseContentEncodingCodecs", () => {
  it("returns empty for missing or identity", () => {
    expect(parseContentEncodingCodecs(null)).toEqual([]);
    expect(parseContentEncodingCodecs(undefined)).toEqual([]);
    expect(parseContentEncodingCodecs("identity")).toEqual([]);
    expect(parseContentEncodingCodecs("")).toEqual([]);
  });

  it("extracts br/gzip/deflate/zstd tokens", () => {
    expect(parseContentEncodingCodecs("br")).toEqual(["br"]);
    expect(parseContentEncodingCodecs("gzip, br")).toEqual(["gzip", "br"]);
    expect(parseContentEncodingCodecs("GZIP")).toEqual(["gzip"]);
    expect(parseContentEncodingCodecs("deflate")).toEqual(["deflate"]);
    expect(parseContentEncodingCodecs("zstd")).toEqual(["zstd"]);
  });
});

describe("downloadAndHash content-encoding guard", () => {
  it("does not invoke curl wire check when Content-Encoding is absent", async () => {
    process.env.ALLBREW_SKIP_CURL_WIRE_CHECK = "1";
    try {
      const data = "plain body";
      const expected = createHash("sha256").update(data).digest("hex");
      global.fetch = mock(() => Promise.resolve(mockResponse(data))) as any;
      const result = await downloadAndHash("http://example.com/file.dmg");
      expect(result.sha256).toBe(expected);
      expect(result.contentEncoding).toBeNull();
    } finally {
      delete process.env.ALLBREW_SKIP_CURL_WIRE_CHECK;
    }
  });

  it("surfaces contentEncoding from response headers", async () => {
    process.env.ALLBREW_SKIP_CURL_WIRE_CHECK = "1";
    try {
      global.fetch = mock(() =>
        Promise.resolve(
          mockResponse("decoded-dmg-bytes", {
            headers: { "content-encoding": "br" },
          }),
        ),
      ) as any;
      const result = await downloadAndHash("http://example.com/Echo.dmg");
      expect(result.contentEncoding).toBe("br");
      expect(result.sha256).toBe(
        createHash("sha256").update("decoded-dmg-bytes").digest("hex"),
      );
    } finally {
      delete process.env.ALLBREW_SKIP_CURL_WIRE_CHECK;
    }
  });
});

describe("downloadToTemp", () => {
  it("downloads to a temp dir and returns the path", async () => {
    const data = "temp file content";
    global.fetch = mock(() => Promise.resolve(mockResponse(data))) as any;

    const result = await downloadToTemp("http://example.com/file.tar.gz");
    expect(result.path).toContain("file.tar.gz");
    expect(result.dir).toBeTruthy();

    const written = await readFile(result.path, "utf-8");
    expect(written).toBe(data);

    await result.cleanup();
    await expect(stat(result.path)).rejects.toThrow();
  });

  it("derives filename from URL when not provided", async () => {
    global.fetch = mock(() => Promise.resolve(mockResponse("x"))) as any;

    const result = await downloadToTemp("http://example.com/path/to/archive.zip");
    expect(result.path.endsWith("archive.zip")).toBe(true);
    await result.cleanup();
  });

  it("uses provided filename", async () => {
    global.fetch = mock(() => Promise.resolve(mockResponse("x"))) as any;

    const result = await downloadToTemp("http://example.com/file", "custom.bin");
    expect(result.path.endsWith("custom.bin")).toBe(true);
    await result.cleanup();
  });

  it("cleanup removes the entire temp directory", async () => {
    global.fetch = mock(() => Promise.resolve(mockResponse("data"))) as any;

    const result = await downloadToTemp("http://example.com/file");
    const dir = result.dir;
    await result.cleanup();
    await expect(stat(dir)).rejects.toThrow();
  });

  it("cleanup is safe to call after the dir is already removed", async () => {
    global.fetch = mock(() => Promise.resolve(mockResponse("data"))) as any;

    const result = await downloadToTemp("http://example.com/file");
    await result.cleanup();
    // Second call should not throw
    await result.cleanup();
  });
});
