import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  discoverPageDownloads,
  discoverMasFallbackCandidates,
  productNameHintsFromUrl,
  extractArtifactUrlsFromJson,
  extractCandidatesFromHtml,
  mergeCandidates,
  parseDiscoverMode,
  pickAutoCandidate,
  scoreCandidateUrl,
  enrichGithubReleaseAssets,
  enrichSparkleAppcast,
  extractAppcastFeedUrls,
  extractEnclosureUrlsFromAppcastXml,
  parseGithubRepoHome,
  isImplausibleArtifactUrl,
  isDownloadHubPath,
  enrichDownloadHubPages,
  looksLikeExtensionlessArtifactUrl,
  isSecondaryGithubRepoUrl,
  enrichExtensionlessArtifactUrls,
  inventClientLatestArtifactUrls,
  enrichClientLatestArtifacts,
  preferNativeInstallersOverStore,
  extractJsDownloadApiCalls,
  enrichJsDownloadApiArtifacts,
  isBinaryInstallerHead,
  isSkillOrCompanionAssetUrl,
  isStoreDownloadGateUrl,
  findStoreDownloadGate,
  filterUnreachableScriptArtifacts,
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

  it("penalizes marketing presskit zips so they lose to app installers", () => {
    const page = "https://cleanshot.com";
    const press = scoreCandidateUrl(
      "https://cleanshot-x.s3.eu-central-1.amazonaws.com/Presskit.zip",
      page,
    );
    const dmg = scoreCandidateUrl(
      "https://updates.getcleanshot.com/v3/CleanShot-X-latest.dmg",
      page,
    );
    expect(press.evidence).toContain("presskit-penalty");
    expect(dmg.score).toBeGreaterThan(press.score);
    expect(press.score).toBeLessThan(70);
  });

  it("scores Gumroad product pages as store-download-gate above nav noise", () => {
    const page = "https://filenq.app";
    const gumroad = scoreCandidateUrl(
      "https://webseidon.gumroad.com/l/jrvyrv",
      page,
      ["post-click:Download free early access"],
    );
    const about = scoreCandidateUrl("https://filenq.app/features", page);
    const css = scoreCandidateUrl(
      "https://filenq.app/_next/static/chunks/app.css",
      page,
    );
    expect(isStoreDownloadGateUrl(gumroad.url)).toBe(true);
    expect(gumroad.kind).toBe("store-download-gate");
    expect(gumroad.score).toBeGreaterThan(about.score);
    expect(css.score).toBeLessThan(0);
    expect(
      pickAutoCandidate([gumroad, about].sort((a, b) => b.score - a.score)),
    ).toBeNull();
    expect(findStoreDownloadGate([gumroad, about])?.url).toContain("gumroad.com");
  });

  it("filterUnreachableScriptArtifacts drops 404 same-site script DMGs", async () => {
    const page = "https://filenq.app";
    const phantom = scoreCandidateUrl(
      "https://filenq.app/build-0.9.0.dmg",
      page,
      ["script-bundle-or-api"],
    );
    phantom.score += 35;
    const gate = scoreCandidateUrl(
      "https://webseidon.gumroad.com/l/jrvyrv",
      page,
      ["bare-url"],
    );
    const kept = await filterUnreachableScriptArtifacts(
      [phantom, gate].sort((a, b) => b.score - a.score),
      page,
      { headOk: async () => false },
    );
    expect(kept.some((c) => c.url.includes("build-0.9.0.dmg"))).toBe(false);
    expect(kept.some((c) => c.kind === "store-download-gate")).toBe(true);
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

  it("extracts absolute download.qoder-style .dmg URLs (path must allow letter s)", async () => {
    // Regression: character class [^"'\\s)] treated "\\s" as backslash+s, so
    // URLs containing "s" (e.g. .../release/latest/Qoder-darwin-arm64.dmg) never matched.
    const { discoverFromScriptBundles } = await import("../../lib/page-discover.ts");
    const pageUrl = "https://qoder.com/download";
    const html = `<!doctype html><html><head>
      <script src="https://cdn.example.com/chunks/download-page.js"></script>
    </head><body><div id="__next"></div></body></html>`;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("download-page.js")) {
        return new Response(
          `[{label:"ARM64",downloadUrl:"https://download.qoder.com/release/latest/Qoder-darwin-arm64.dmg"},{label:"X64",downloadUrl:"https://download.qoder.com/release/latest/Qoder-darwin-x64.dmg"}]`,
          { status: 200, headers: { "content-type": "application/javascript" } },
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    try {
      const cands = await discoverFromScriptBundles(pageUrl, html);
      expect(
        cands.some((c) =>
          c.url.includes("download.qoder.com/release/latest/Qoder-darwin-arm64.dmg"),
        ),
      ).toBe(true);
      const top = pickAutoCandidate(cands);
      expect(top?.kind).toBe("cask-dmg");
      expect(top?.url).toMatch(/Qoder-darwin-.*\.dmg/);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("prefers cask-dmg from hub bundles over mac-app-store marketing link", async () => {
    const page = "https://qoder.com/";
    const homeHtml = `<!doctype html><html><body>
      <a href="/download">Download</a>
      <a href="/desktop">Desktop</a>
    </body></html>`;
    const downloadHtml = `<!doctype html><html><head>
      <script src="https://cdn.example.com/qoder-download.js"></script>
    </head><body>
      <a href="https://apps.apple.com/app/qoder/id6764005182">Mac App Store</a>
    </body></html>`;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("qoder-download.js")) {
        return new Response(
          `downloadUrl:"https://download.qoder.com/release/latest/Qoder-darwin-arm64.dmg"`,
          { status: 200, headers: { "content-type": "application/javascript" } },
        );
      }
      if (u.includes("/download")) {
        return new Response(downloadHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    try {
      const result = await discoverPageDownloads(page, {
        mode: "static",
        htmlFixture: { body: homeHtml, finalUrl: page },
        fetchHubHtml: async (url) => {
          if (url.includes("/download")) {
            return { body: downloadHtml, finalUrl: "https://qoder.com/download" };
          }
          return { body: "<html></html>", finalUrl: url };
        },
      });
      expect(result.chosen?.kind).toBe("cask-dmg");
      expect(result.chosen?.url).toContain("Qoder-darwin");
      expect(result.chosen?.url).toContain(".dmg");
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



describe("extensionless download APIs (Halo-style)", () => {
  it("detects extensionless artifact URLs", () => {
    expect(looksLikeExtensionlessArtifactUrl("https://api.heyhalo.app/download/latest")).toBe(true);
    expect(looksLikeExtensionlessArtifactUrl("https://dl.pstmn.io/download/latest/osx")).toBe(true);
    expect(looksLikeExtensionlessArtifactUrl("https://heyhalo.app/download")).toBe(false);
    expect(looksLikeExtensionlessArtifactUrl("https://cdn.example.com/App.dmg")).toBe(false);
    expect(looksLikeExtensionlessArtifactUrl("https://unpeel.com/download/mac")).toBe(true);
    expect(looksLikeExtensionlessArtifactUrl("https://unpeel.com/download/macos")).toBe(true);
  });

  it("flags secondary github companion repos", () => {
    expect(isSecondaryGithubRepoUrl("https://github.com/HeyHalo-App/heyhalo-ios")).toBe(true);
    expect(isSecondaryGithubRepoUrl("https://github.com/HeyHalo-App/heyhalo-reach-kit")).toBe(true);
    expect(isSecondaryGithubRepoUrl("https://github.com/acme/desktop")).toBe(false);
  });

  it("scores extensionless API above secondary github", () => {
    const page = "https://heyhalo.app";
    const api = scoreCandidateUrl("https://api.heyhalo.app/download/latest", page);
    const ios = scoreCandidateUrl("https://github.com/HeyHalo-App/heyhalo-ios", page);
    expect(api.score).toBeGreaterThan(ios.score);
  });

  it("HEAD-probe reclassifies extensionless URL as cask-dmg", async () => {
    const page = "https://example.com";
    const seed = scoreCandidateUrl("https://api.example.com/download/latest", page);
    const merged = await enrichExtensionlessArtifactUrls([seed], page, {
      classifyHead: async (url) => ({ type: "cask-dmg", url }),
    });
    const top = merged[0];
    expect(top.kind).toBe("cask-dmg");
    expect(top.score).toBeGreaterThanOrEqual(120);
    expect(top.evidence.some((e) => e.includes("head-cask-dmg") || e.includes("extensionless-head-probe"))).toBe(true);
  });

  it("invents same-origin /download/mac when homepage has no artifact href", async () => {
    const page = "https://unpeel.com/";
    const weak = scoreCandidateUrl("https://unpeel.com/docs", page, ["html-attr"]);
    const merged = await enrichExtensionlessArtifactUrls([weak], page, {
      classifyHead: async (url) => {
        if (url.endsWith("/download/mac")) return { type: "cask-dmg", url };
        return { type: "unknown", url };
      },
    });
    const hit = merged.find((c) => c.url.includes("/download/mac"));
    expect(hit).toBeTruthy();
    expect(hit!.kind).toBe("cask-dmg");
    expect(hit!.score).toBeGreaterThanOrEqual(120);
  });
});


describe("client/latest native installer probes (Zoom-class vendors)", () => {
  it("invents Zoom.pkg and zoomusInstallerFull.pkg under /client/latest", () => {
    const fromUs = inventClientLatestArtifactUrls("https://zoom.us/");
    const fromCom = inventClientLatestArtifactUrls("https://www.zoom.com/");
    expect(fromUs.some((u) => u.includes("zoom.us") && u.endsWith("/client/latest/Zoom.pkg"))).toBe(true);
    expect(fromCom.some((u) => u.includes("zoom.us") && u.endsWith("/client/latest/Zoom.pkg"))).toBe(true);
    expect(fromUs.some((u) => /zoomusInstallerFull\.pkg$/i.test(u))).toBe(true);
  });

  it("prefers native pkg over mac-app-store when both present", () => {
    const page = "https://www.zoom.com/";
    const list = preferNativeInstallersOverStore([
      scoreCandidateUrl("https://itunes.apple.com/us/app/id546505307", page, ["webview"]),
      scoreCandidateUrl("https://zoom.us/client/latest/Zoom.pkg", page, ["client-latest-guess"]),
    ]);
    expect(list[0].kind).toBe("cask-dmg");
    expect(list[0].url).toContain("Zoom.pkg");
    expect(list.find((c) => c.kind === "mac-app-store")?.evidence).toContain(
      "store-vs-native-penalty",
    );
  });

  it("penalizes App Store storefront pages without /idNNNN (superwhisper-class)", () => {
    const page = "https://superwhisper.com/";
    const storefront = scoreCandidateUrl(
      "https://apps.apple.com/us/mac/discover",
      page,
      ["html-attr"],
    );
    const realApp = scoreCandidateUrl(
      "https://apps.apple.com/us/app/superwhisper-ai-dictation/id6471464415",
      page,
      ["html-attr"],
    );
    expect(storefront.evidence).toContain("mas-no-app-id-penalty");
    expect(realApp.evidence).toContain("mas-app-id");
    expect(realApp.score).toBeGreaterThan(storefront.score);
    const ranked = [storefront, realApp].sort((a, b) => b.score - a.score);
    expect(pickAutoCandidate(ranked)?.url).toContain("id6471464415");
  });

  it("enrichClientLatestArtifacts promotes HEAD-ok /client/latest pkg over MAS", async () => {
    const page = "https://zoom.us/";
    const mas = scoreCandidateUrl(
      "https://itunes.apple.com/us/app/id546505307",
      page,
      ["webview"],
    );
    const result = await enrichClientLatestArtifacts([mas], page, {
      headOk: async (url) => /\/client\/latest\/Zoom\.pkg$/i.test(url),
    });
    const chosen = pickAutoCandidate(preferNativeInstallersOverStore(result));
    expect(chosen?.kind).toBe("cask-dmg");
    expect(chosen?.url).toMatch(/Zoom\.pkg$/);
  });

  it("does not invent unrelated brand.com client/latest for ia.net", () => {
    const urls = inventClientLatestArtifactUrls("https://ia.net/writer");
    expect(urls.every((u) => /ia\.net/i.test(u))).toBe(true);
    expect(urls.some((u) => /ia\.com/i.test(u))).toBe(false);
  });

  it("isBinaryInstallerHead rejects HTML shells on .pkg URLs", () => {
    expect(
      isBinaryInstallerHead("text/html", "114", "https://ia.com/client/latest/iaInstallerFull.pkg"),
    ).toBe(false);
    expect(
      isBinaryInstallerHead(
        "application/octet-stream",
        "50000000",
        "https://zoom.us/client/latest/Zoom.pkg",
      ),
    ).toBe(true);
  });
});

describe("js download API (iA Writer class)", () => {
  it("extracts download(this, type, code) from HTML entities", () => {
    const html = `
<button onclick="download&#x28;this,&#x20;&quot;writer&quot;,&#x20;&quot;writer-landing&quot;&#x29;">Mac</button>
<button onclick='download(this, "writer-windows", "writer-landing")'>Win</button>
`;
    const calls = extractJsDownloadApiCalls(html);
    expect(calls.some((c) => c.type === "writer" && c.code === "writer-landing")).toBe(true);
    expect(calls.some((c) => /windows/i.test(c.type))).toBe(false);
  });

  it("enrichJsDownloadApiArtifacts promotes JSON file URL over MAS", async () => {
    const page = "https://ia.net/writer";
    const html = `onclick="download(this, &quot;writer&quot;, &quot;writer-landing&quot;)"`;
    const mas = scoreCandidateUrl(
      "https://apps.apple.com/app/id775737590?mt=12",
      page,
      ["html-attr"],
    );
    const result = await enrichJsDownloadApiArtifacts([mas], page, html, {
      fetchJson: async () => ({
        success: true,
        file: "https://files.ia.net/writer/release/iA-Writer-8.0.5-80037.zip",
      }),
    });
    const chosen = pickAutoCandidate(result);
    expect(chosen?.url).toContain("iA-Writer-8.0.5");
    expect(chosen?.url).toMatch(/\.zip$/);
    expect(chosen!.score).toBeGreaterThanOrEqual(135);
  });
});

describe("skill companion assets vs download-hub DMGs (ego-lite class)", () => {
  it("detects ego-browser skill zips as companion assets", () => {
    expect(
      isSkillOrCompanionAssetUrl(
        "https://github.com/citrolabs/ego-lite/releases/download/v1.2.5/ego-browser-v1.2.5.zip",
      ),
    ).toBe(true);
    expect(
      isSkillOrCompanionAssetUrl("https://cdn.ego.app/setup/macos/arm64/egolite.dmg"),
    ).toBe(false);
  });

  it("penalizes skill zips so CDN DMGs win scoring", () => {
    const page = "https://lite.ego.app";
    const skill = scoreCandidateUrl(
      "https://github.com/citrolabs/ego-lite/releases/download/v1.2.5/ego-browser-v1.2.5.zip",
      page,
      ["github-release-asset"],
    );
    const dmg = scoreCandidateUrl(
      "https://cdn.ego.app/setup/macos/arm64/egolite.dmg",
      page,
      ["script-bundle-or-api"],
    );
    expect(skill.evidence).toContain("skill-companion-asset-penalty");
    expect(dmg.score).toBeGreaterThan(skill.score);
  });

  it("enrichDownloadHubPages still follows hubs when only skill zip is present", async () => {
    const page = "https://lite.ego.app/";
    const skill = scoreCandidateUrl(
      "https://github.com/citrolabs/ego-lite/releases/download/v1.2.5/ego-browser-v1.2.5.zip",
      page,
      ["github-release-asset", "release-enrichment"],
    );
    skill.score += 20;
    const hubHtml = `<html><a href="https://cdn.ego.app/setup/macos/arm64/egolite.dmg">Download</a></html>`;
    const merged = await enrichDownloadHubPages(
      [skill],
      page,
      `<a href="/download">Download for Mac</a>`,
      {
        hubHtmlByUrl: {
          "https://lite.ego.app/download": hubHtml,
        },
      },
    );
    const dmg = merged.find((c) => /egolite\.dmg/i.test(c.url));
    expect(dmg).toBeTruthy();
    expect(dmg!.kind).toBe("cask-dmg");
  });
});

describe("MAS iTunes fallback (auth-walled marketing pages)", () => {
  it("productNameHintsFromUrl uses hostname label and nameHint", () => {
    expect(productNameHintsFromUrl("https://pieoneer.app/")).toContain("pieoneer");
    expect(productNameHintsFromUrl("https://www.pieoneer.app/", "Pieoneer")[0]).toBe(
      "Pieoneer",
    );
  });

  it("discoverMasFallbackCandidates returns exact macSoftware hit", async () => {
    const cands = await discoverMasFallbackCandidates("https://pieoneer.app/", {
      nameHint: "pieoneer",
      itunesSearch: async (term) => {
        expect(term.toLowerCase()).toContain("pieoneer");
        return [
          {
            kind: "mac-software",
            trackId: 6739781207,
            trackName: "Pieoneer",
            sellerUrl: "https://appahead.studio/apps/pieoneer/",
          },
          {
            kind: "mac-software",
            trackId: 999,
            trackName: "Unrelated App",
          },
        ];
      },
    });
    expect(cands.length).toBe(1);
    expect(cands[0].kind).toBe("mac-app-store");
    expect(cands[0].url).toContain("id6739781207");
    expect(cands[0].evidence).toContain("mas-itunes-search-fallback");
    expect(cands[0].score).toBeGreaterThanOrEqual(90);
  });

  it("discoverPageDownloads recovers MAS when page fetch would be empty via fixture+search", async () => {
    // Empty HTML shell + no static links → A.10 MAS fallback
    const result = await discoverPageDownloads("https://pieoneer.app/", {
      mode: "static",
      htmlFixture: { body: "<html><body></body></html>", finalUrl: "https://pieoneer.app/" },
      itunesSearch: async () => [
        {
          kind: "mac-software",
          trackId: 6739781207,
          trackName: "Pieoneer",
          sellerUrl: "https://appahead.studio/apps/pieoneer/",
        },
      ],
    });
    expect(result.chosen?.kind).toBe("mac-app-store");
    expect(result.chosen?.url).toContain("id6739781207");
  });

  it("rejects loose prefix MAS hits for short generic terms (hermesapp.io)", async () => {
    // hermes (6) vs hermesthefuryofmegaera (22): seller alawar unrelated → 0
    const cands = await discoverMasFallbackCandidates("https://hermesapp.io", {
      nameHint: "hermes",
      itunesSearch: async () => [
        {
          kind: "mac-software",
          trackId: 6450658263,
          trackName: "Hermes: The Fury of Megaera",
          sellerUrl: "https://company.alawar.com/en/",
        },
      ],
    });
    expect(cands.length).toBe(0);
  });

  it("rejects easyfind→EasyFinder 2 prefix on unrelated host (devmate.com)", async () => {
    // easyfind (8) vs easyfinder2 (11): lenDiff 3 would pass hermes-style lenDiff<=4,
    // but seller easyfinderapp.com is unrelated to devmate.com → 0
    const cands = await discoverMasFallbackCandidates("https://devmate.com", {
      nameHint: "easyfind",
      itunesSearch: async () => [
        {
          kind: "mac-software",
          trackId: 1531238115,
          trackName: "EasyFinder 2",
          sellerUrl: "http://easyfinderapp.com",
        },
      ],
    });
    expect(cands.length).toBe(0);
  });

  it("allows prefix MAS hit when seller host relates to page host", async () => {
    const cands = await discoverMasFallbackCandidates("https://easyfinderapp.com", {
      nameHint: "easyfind",
      itunesSearch: async () => [
        {
          kind: "mac-software",
          trackId: 1531238115,
          trackName: "EasyFinder 2",
          sellerUrl: "http://easyfinderapp.com",
        },
      ],
    });
    expect(cands.length).toBe(1);
    expect(cands[0].url).toContain("id1531238115");
    expect(cands[0].evidence).toContain("mas-seller-host-related");
  });
});

describe("sparkle appcast enrichment", () => {
  it("extracts appcast feed URLs from HTML/JS", () => {
    const html = `
      <script>
        res = await fetch("https://r2.aizen.win/appcast.xml");
      </script>
    `;
    const feeds = extractAppcastFeedUrls(html, "https://aizen.win/");
    expect(feeds).toContain("https://r2.aizen.win/appcast.xml");
  });

  it("parses enclosure URLs from appcast XML", () => {
    const xml = `<?xml version="1.0"?>
      <rss><channel><item>
        <enclosure url="https://r2.aizen.win/Aizen-1.0.83.dmg" length="1" type="application/octet-stream" />
      </item></channel></rss>`;
    expect(extractEnclosureUrlsFromAppcastXml(xml)).toEqual([
      "https://r2.aizen.win/Aizen-1.0.83.dmg",
    ]);
  });

  it("enriches candidates with DMG from appcast when GitHub has no assets", async () => {
    const page = "https://aizen.win/";
    const html = `fetch("https://r2.aizen.win/appcast.xml")`;
    const list = [
      scoreCandidateUrl("https://github.com/vivy-company/aizen", page, ["html"]),
    ];
    const enriched = await enrichSparkleAppcast(list, page, html, {
      fetchText: async () => ({
        body: `<rss><channel><item><enclosure url="https://r2.aizen.win/Aizen-1.0.83.dmg" /></item></channel></rss>`,
      }),
    });
    const dmg = enriched.find((c) => c.url.includes(".dmg"));
    expect(dmg).toBeTruthy();
    expect(dmg!.kind).toBe("cask-dmg");
    expect(dmg!.score).toBeGreaterThan(list[0].score);
    expect(dmg!.evidence.join(" ")).toMatch(/appcast/);
  });
});

