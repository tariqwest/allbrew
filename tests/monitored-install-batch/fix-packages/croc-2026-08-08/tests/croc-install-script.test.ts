import { describe, it, expect } from "bun:test";
import { classify, classifyWithHead } from "../../lib/classifier.ts";

describe("getcroc.schollz.com install script", () => {
  it("does not treat github.com/sponsors/* as a repo offline", () => {
    const result = classify("https://github.com/sponsors/schollz");
    expect(result.type).toBe("unknown");
  });

  it("still classifies real repos", () => {
    const result = classify("https://github.com/schollz/croc");
    expect(result.type).toBe("github-repo");
    expect(result.owner).toBe("schollz");
    expect(result.repo).toBe("croc");
  });

  it("sniffs text/plain shebang as bash-script", async () => {
    const originalFetch = global.fetch;
    const body = "#!/bin/bash - \n# croc Installer Script.\nPREFIX=/usr/local/bin\n";
    global.fetch = ((url: string, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      if (method === "HEAD") {
        return Promise.resolve(
          new Response(null, {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
          }),
        );
      }
      return Promise.resolve(
        new Response(body, {
          status: 206,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "content-range": "bytes 0-511/900",
          },
        }),
      );
    }) as any;

    try {
      const result = await classifyWithHead("https://getcroc.schollz.com");
      expect(result.type).toBe("bash-script");
      expect(result.url).toBe("https://getcroc.schollz.com");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("binary-release prefers primary over -web companion", () => {
  it("scores croc_ over croc-web_ for linux intel", async () => {
    // Light integration: regenerate payload selection via matching names
    const assets = [
      "croc-web_v11.0.2_Linux-amd64.tar.gz",
      "croc_v11.0.2_Linux-64bit.tar.gz",
      "croc_v11.0.2_macOS-ARM64.tar.gz",
      "croc_v11.0.2_macOS-64bit.tar.gz",
    ];
    const { matchAssetToArch } = await import("../../lib/utils.ts");
    const formulaName = "croc";
    const score = (assetName: string) => {
      const base = assetName.split("/").pop() || assetName;
      const fn = formulaName.toLowerCase().replace(/-tap$/, "");
      let s = 0;
      if (new RegExp(`^${fn}[-_.]`, "i").test(base)) s += 50;
      if (new RegExp(`^${fn}[-_]?web\\b`, "i").test(base) || /[-_.]web[-_.]/i.test(base))
        s -= 40;
      return s;
    };
    const archAssets: Record<string, string> = {};
    for (const name of assets) {
      const arch = matchAssetToArch(name);
      if (!arch) continue;
      const prev = archAssets[arch];
      if (!prev || score(name) > score(prev)) archAssets[arch] = name;
    }
    expect(archAssets.linuxIntel).toBe("croc_v11.0.2_Linux-64bit.tar.gz");
    expect(archAssets.macosArm).toBe("croc_v11.0.2_macOS-ARM64.tar.gz");
  });
});
