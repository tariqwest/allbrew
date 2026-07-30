import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  discoverPageDownloads,
  extractCandidatesFromHtml,
  mergeCandidates,
  parseDiscoverMode,
  pickAutoCandidate,
  scoreCandidateUrl,
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
