import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  discoverPageDownloads,
  extractArtifactUrlsFromJson,
  extractCandidatesFromHtml,
  mergeCandidates,
  parseDiscoverMode,
  pickAutoCandidate,
  scoreCandidateUrl,
  enrichGithubReleaseAssets,
  parseGithubRepoHome,
  isImplausibleArtifactUrl,
  isDownloadHubPath,
  enrichDownloadHubPages,
} from "../../lib/page-discover.ts";
import { assertSafePublicFetchUrl } from "../../lib/utils.ts";

const fixtures = resolve(import.meta.dir, "../fixtures/page-discover");

describe("parseDiscoverMode", () => {
  it("parses modes", () => {
    expect(parseDiscoverMode("auto")).toBe("auto");
    expect(parseDiscoverMode("static")).toBe("static");
    expect(parseDiscoverMode("webview")).toBe("webview");
    expect(parseDiscoverMode("off")).toBe("off");
    expect(parseDiscoverMode(false)).toBe("off");
    expect(parseDiscoverMode(undefined)).toBe("auto");
  });
});

describe("assertSafePublicFetchUrl", () => {
  it("blocks localhost and private IPv4", () => {
    const priv = (a: number, b: number, c: number, d: number) =>
      `http://${[a, b, c, d].join(".")}/x`;
    expect(() => assertSafePublicFetchUrl("http://localhost/x")).toThrow(/private or local/);
    expect(() => assertSafePublicFetchUrl(priv(127, 0, 0, 1))).toThrow(/private or local/);
    expect(() => assertSafePublicFetchUrl(priv(10, 0, 0, 1))).toThrow(/private or local/);
    expect(() => assertSafePublicFetchUrl(priv(192, 168, 1, 1))).toThrow(/private or local/);
    expect(() => assertSafePublicFetchUrl()).toThrow();
  });

  it("allows public https URLs", () => {
    expect(() => assertSafePublicFetchUrl("https://example.com/download")).not.toThrow();
  });
});

describe("extractCandidatesFromHtml", () => {
  it("prefers macOS dmg over github social noise", () => {
    const html = readFileSync(resolve(fixtures, "proxyman-style.html"), "utf-8");
    const cands = extractCandidatesFromHtml(html, "https://proxyman.io/");
    expect(cands.length).toBeGreaterThan(0);
    expect(cands[0].url).toContain("Proxyman_latest.dmg");
    expect(cands[0].kind).toBe("cask-dmg");
    expect(cands.some((c) => c.url.includes("twitter.com"))).toBe(false);
  });

  it("extracts curl|bash install script URL", () => {
    const html = readFileSync(resolve(fixtures, "starship-style.html"), "utf-8");
    const cands = extractCandidatesFromHtml(html, "https://starship.rs/");
    const script = cands.find((c) => c.url.includes("install.sh"));
    expect(script).toBeTruthy();
    expect(script!.kind).toBe("bash-script");
  });
});

describe("scoreCandidateUrl / pickAutoCandidate", () => {
  it("scores dmg higher than bare github repo", () => {
    const page = "https://example.com";
    const dmg = scoreCandidateUrl("https://cdn.example.com/App.dmg", page);
    const gh = scoreCandidateUrl("https://github.com/acme/app", page);
    expect(dmg.score).toBeGreaterThan(gh.score);
  });

  it("auto-picks clear dmg winner", () => {
    const page = "https://example.com";
    const list = [
      scoreCandidateUrl("https://cdn.example.com/App.dmg", page),
      scoreCandidateUrl("https://github.com/acme/app", page),
    ].sort((a, b) => b.score - a.score);
    const chosen = pickAutoCandidate(list);
    expect(chosen?.url).toContain(".dmg");
  });

  it("does not auto-pick low scores", () => {
    const page = "https://example.com";
    const list = [scoreCandidateUrl("https://example.com/about", page)];
    expect(pickAutoCandidate(list)).toBeNull();
  });
});

describe("discoverPageDownloads with fixtures", () => {
  it("resolves proxyman-style page statically without network", async () => {
    const html = readFileSync(resolve(fixtures, "proxyman-style.html"), "utf-8");
    const result = await discoverPageDownloads("https://proxyman.io/", {
      mode: "static",
      htmlFixture: { body: html, finalUrl: "https://proxyman.io/" },
    });
    expect(result.method).toBe("static");
    expect(result.chosen?.url).toContain(".dmg");
    expect(result.chosen?.kind).toBe("cask-dmg");
  });

  it("resolves starship-style install script statically", async () => {
    const html = readFileSync(resolve(fixtures, "starship-style.html"), "utf-8");
    const result = await discoverPageDownloads("https://starship.rs/", {
      mode: "static",
      htmlFixture: { body: html },
    });
    expect(result.chosen?.url).toBe("https://starship.rs/install.sh");
  });

  it("escalates empty SPA shell to webview inject and merges", async () => {
    const html = readFileSync(resolve(fixtures, "spa-shell.html"), "utf-8");
    const result = await discoverPageDownloads("https://spa.example/", {
      mode: "auto",
      htmlFixture: { body: html },
      webviewDiscover: async () => [
        {
          url: "https://cdn.example.com/App-mac.dmg",
          kind: "cask-dmg",
          score: 120,
          evidence: ["webview-mock"],
          source: "webview",
        },
      ],
    });
    expect(result.method).toBe("webview");
    expect(result.chosen?.url).toContain("App-mac.dmg");
  });

  it("off mode returns nothing", async () => {
    const result = await discoverPageDownloads("https://example.com", {
      mode: "off",
    });
    expect(result.candidates).toEqual([]);
    expect(result.chosen).toBeNull();
  });
});

describe("mergeCandidates", () => {
  it("dedupes by URL keeping higher score", () => {
    const a = scoreCandidateUrl("https://x.com/a.dmg", "https://x.com");
    a.score = 50;
    const b = { ...a, score: 90, source: "webview" as const };
    const merged = mergeCandidates([a], [b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].score).toBe(90);
    expect(merged[0].source).toBe("webview");
  });
});

describe("isImplausibleArtifactUrl / download hubs (superconductor)", () => {
  it("rejects comma-separated extension allowlist paths from SPA bundles", () => {
    const bad =
      "https://www.superconductor.com/.7z,.aac,.apk,.avi,.bmp,.bz2,.css,.csv,.deb,.dmg,.doc,.docx,.exe,.gif,.gz,.heic,.heif,.ico,.iso,.jpeg,.jpg,.js,.json,.m4a,.mkv,.mov,.mp3,.mp4,.mpeg,.mpg,.msi,.ogg,.ogv,.pdf,.pkg,.png,.ppt,.pptx,.rar,.rtf,.svg,.tar,.tif,.tiff,.txt,.wav,.webm,.webp,.wma,.wmv,.xls,.xlsx,.xml,.zip";
    expect(isImplausibleArtifactUrl(bad)).toBe(true);
    expect(isImplausibleArtifactUrl("https://cdn.example.com/App.dmg")).toBe(false);
    expect(
      isImplausibleArtifactUrl(
        "https://github.com/superconductor/desktop-releases/releases/latest/download/Superconductor-mac-arm64.dmg",
      ),
    ).toBe(false);
  });

  it("detects download hub paths", () => {
    expect(isDownloadHubPath("https://www.superconductor.com/download")).toBe(true);
    expect(isDownloadHubPath("https://www.superconductor.com/pricing")).toBe(false);
    expect(isDownloadHubPath("https://cdn.example.com/App.dmg")).toBe(false);
  });

  it("follows same-site /download hub to pick macOS DMG", async () => {
    const home =
      `<html><body><nav><a href="/download">Download</a><a href="/pricing">Pricing</a></nav></body></html>`;
    const hub = `<html><body>
      <a href="https://github.com/superconductor/desktop-releases/releases/latest/download/Superconductor-mac-arm64.dmg">Apple Silicon</a>
      <a href="https://github.com/superconductor/desktop-releases/releases/latest/download/Superconductor-mac-x64.dmg">Intel</a>
      <a href="https://apps.apple.com/us/app/superconductor/id6749349238">App Store</a>
    </body></html>`;
    const result = await discoverPageDownloads("https://superconductor.dev/", {
      mode: "static",
      htmlFixture: { body: home, finalUrl: "https://superconductor.dev/" },
      fetchHubHtml: async (url: string) => {
        if (url.includes("/download")) return { body: hub, finalUrl: url };
        return { body: "", finalUrl: url };
      },
    });
    expect(result.chosen?.kind).toBe("cask-dmg");
    expect(result.chosen?.url).toMatch(/Superconductor-mac-arm64\.dmg|Superconductor-mac-x64\.dmg/);
  });

  it("enrichDownloadHubPages merges hub DMG candidates", async () => {
    const page = "https://example.com/";
    const landing = extractCandidatesFromHtml(
      `<a href="/download">Download</a><a href="/about">About</a>`,
      page,
    );
    const merged = await enrichDownloadHubPages(landing, page, `<a href="/download">Download</a>`, {
      fetchHtml: async () => ({
        body: `<a href="https://cdn.example.com/App-mac.dmg">dmg</a>`,
        finalUrl: "https://example.com/download",
      }),
    });
    expect(merged.some((c) => c.url.endsWith(".dmg"))).toBe(true);
    expect(pickAutoCandidate(merged)?.url).toContain(".dmg");
  });
});

describe("discoverFromScriptBundles relative SPA artifacts", () => {
  it("resolves quoted relative .dmg paths from JS bundles against page origin", async () => {
    const { discoverFromScriptBundles } = await import("../../lib/page-discover.ts");
    const pageUrl = "https://avelio.example/unfatten";
    const html = `<!doctype html><html><head>
      <script type="module" src="/assets/app.js"></script>
    </head><body><div id="root"></div></body></html>`;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("/assets/app.js")) {
        return new Response(
          `y.jsx("a",{href:"/download/Unfatten16.dmg",children:"Download"});href:"/download/Unfatten.zip"`,
          { status: 200, headers: { "content-type": "application/javascript" } },
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    try {
      const cands = await discoverFromScriptBundles(pageUrl, html);
      expect(cands.some((c) => c.url === "https://avelio.example/download/Unfatten16.dmg")).toBe(true);
      expect(cands.some((c) => c.url.endsWith(".dmg") && c.kind === "cask-dmg")).toBe(true);
      const top = pickAutoCandidate(cands);
      expect(top?.url).toContain("Unfatten16.dmg");
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});


describe("extractArtifactUrlsFromJson", () => {
  it("finds nested dmg urls and prefers them in discovery scoring", () => {
    const payload = {
      data: {
        manifest: {
          darwin: {
            download: [
              { region: "cn", apple: "https://lf-cdn.example.cn/Trae-darwin-arm64.dmg" },
              { region: "us", apple: "https://lf-cdn.example.com/Trae-darwin-arm64.dmg", intel: "https://lf-cdn.example.com/Trae-darwin-x64.dmg" },
            ],
          },
          win32: { download: [{ x64: "https://lf-cdn.example.com/Trae-win32-x64.exe" }] },
        },
      },
    };
    const urls = extractArtifactUrlsFromJson(payload);
    expect(urls.some((u) => u.endsWith(".dmg"))).toBe(true);
    const dmgs = urls.filter((u) => u.endsWith(".dmg"));
    const scored = dmgs.map((u) => scoreCandidateUrl(u, "https://www.trae.ai/download"));
    scored.sort((a, b) => b.score - a.score);
    expect(scored[0].url).toContain(".dmg");
    expect(scored[0].kind).toBe("cask-dmg");
  });
});

describe("enrichGithubReleaseAssets", () => {
  it("parses clean github repo homes only", () => {
    expect(parseGithubRepoHome("https://github.com/fathah/hermes-desktop")).toEqual({
      owner: "fathah",
      repo: "hermes-desktop",
    });
    expect(parseGithubRepoHome("https://github.com/fathah/hermes-desktop/blob/main/LICENSE")).toBeNull();
  });

  it("adds release DMG candidates so they beat install scripts", async () => {
    const page = "https://hermesone.org/";
    const list = [
      scoreCandidateUrl(
        "https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh",
        page,
        ["install-command"],
      ),
      scoreCandidateUrl("https://github.com/fathah/hermes-desktop", page),
      scoreCandidateUrl("https://github.com/NousResearch/hermes-agent", page),
    ].sort((a, b) => b.score - a.score);

    const enriched = await enrichGithubReleaseAssets(list, page, {
      getLatestRelease: async (owner, repo) => {
        if (owner === "fathah" && repo === "hermes-desktop") {
          return {
            tagName: "v0.7.6",
            assets: [
              {
                name: "hermes-desktop-0.7.6-arm64.dmg",
                url: "https://github.com/fathah/hermes-desktop/releases/download/v0.7.6/hermes-desktop-0.7.6-arm64.dmg",
              },
            ],
          };
        }
        return { tagName: "v1.0.0", assets: [] };
      },
    });

    const chosen = pickAutoCandidate(enriched);
    expect(chosen?.kind).toBe("cask-dmg");
    expect(chosen?.url).toContain(".dmg");
    expect(chosen!.score).toBeGreaterThan(list[0].score);
  });
});

