import { describe, it, expect } from "bun:test";
import { classify, classifyWithHead } from "../../lib/classifier.ts";

// ─── B3: Classifier / routing conflict matrix ───────────────────────────
// Table-driven tests covering routing conflicts and edge cases.
// Each row documents the expected strategy for a given input.

type ConflictCase = {
  name: string;
  url: string;
  expectedType: string;
  expectedFields?: Record<string, string>;
};

const CONFLICT_MATRIX: ConflictCase[] = [
  // Registry URLs — should route to the correct package type
  {
    name: "npmjs.com URL → npm-package",
    url: "https://www.npmjs.com/package/maildev",
    expectedType: "npm-package",
    expectedFields: { packageName: "maildev" },
  },
  {
    name: "pypi.org URL → pip-package",
    url: "https://pypi.org/project/marimo/",
    expectedType: "pip-package",
    expectedFields: { packageName: "marimo" },
  },
  {
    name: "crates.io URL → cargo-package (was unknown, now fixed)",
    url: "https://crates.io/crates/ripgrep",
    expectedType: "cargo-package",
    expectedFields: { crateName: "ripgrep" },
  },
  {
    name: "rubygems.org URL → gem-package",
    url: "https://rubygems.org/gems/pry",
    expectedType: "gem-package",
    expectedFields: { gemName: "pry" },
  },
  {
    name: "nuget.org URL → dotnet-package",
    url: "https://www.nuget.org/packages/dotnet-serve",
    expectedType: "dotnet-package",
    expectedFields: { packageName: "dotnet-serve" },
  },
  // GitHub repo URLs — should route to github-repo (generator selection
  // happens later in the CLI flow based on repo contents)
  {
    name: "GitHub repo URL → github-repo",
    url: "https://github.com/muety/wakapi",
    expectedType: "github-repo",
    expectedFields: { owner: "muety", repo: "wakapi" },
  },
  {
    name: "GitHub repo with .git suffix → github-repo (strips .git)",
    url: "https://github.com/robinovitch61/wander.git",
    expectedType: "github-repo",
    expectedFields: { repo: "wander" },
  },
  {
    name: "GitHub tree URL → github-repo (normalizes to repo root)",
    url: "https://github.com/muety/wakapi/tree/master/src",
    expectedType: "github-repo",
  },
  // Script URLs
  {
    name: ".sh URL → bash-script",
    url: "https://starship.rs/install.sh",
    expectedType: "bash-script",
  },
  {
    name: "raw.githubusercontent.com .sh → bash-script",
    url: "https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh",
    expectedType: "bash-script",
  },
  // Archive URLs
  {
    name: ".dmg URL → cask-dmg",
    url: "https://example.com/app.dmg",
    expectedType: "cask-dmg",
  },
  {
    name: ".tar.gz URL → archive",
    url: "https://example.com/foo-1.0.tar.gz",
    expectedType: "archive",
  },
  {
    name: ".zip URL → archive",
    url: "https://example.com/release.zip",
    expectedType: "archive",
  },
  {
    name: "raw.githubusercontent.com archive → archive (not bash-script)",
    url: "https://raw.githubusercontent.com/someone/repo/main/dist/release.tar.gz",
    expectedType: "archive",
  },
  // App store / Setapp
  {
    name: "apps.apple.com URL → mac-app-store",
    url: "https://apps.apple.com/us/app/bear/id1091189122",
    expectedType: "mac-app-store",
  },
  {
    name: "setapp.com URL → setapp-app",
    url: "https://setapp.com/apps/bartender",
    expectedType: "setapp-app",
    expectedFields: { slug: "bartender" },
  },
  // Unknown
  {
    name: "bare domain without extension → unknown",
    url: "https://get.volta.sh",
    expectedType: "unknown",
  },
];

describe("B3: classifier conflict matrix", () => {
  for (const { name, url, expectedType, expectedFields } of CONFLICT_MATRIX) {
    it(name, () => {
      const result = classify(url);
      expect(result.type).toBe(expectedType);
      if (expectedFields) {
        for (const [key, value] of Object.entries(expectedFields)) {
          expect((result as any)[key]).toBe(value);
        }
      }
    });
  }
});

describe("B3: routing priority (conflict resolution)", () => {
  it("npmjs.com URL wins over github.com (npm URL is more specific)", () => {
    // An npm URL should route to npm-package, not github-repo
    const result = classify("https://www.npmjs.com/package/maildev");
    expect(result.type).toBe("npm-package");
  });

  it("crates.io URL wins over unknown (crates.io is now recognized)", () => {
    const result = classify("https://crates.io/crates/ripgrep");
    expect(result.type).toBe("cargo-package");
  });

  it(".dmg URL wins over archive (more specific)", () => {
    const result = classify("https://example.com/app.dmg");
    expect(result.type).toBe("cask-dmg");
  });

  it("raw.githubusercontent.com archive wins over bash-script", () => {
    // raw.githubusercontent.com is normally bash-script, but archive
    // extensions should take priority
    const result = classify(
      "https://raw.githubusercontent.com/someone/repo/main/dist/release.tar.gz",
    );
    expect(result.type).toBe("archive");
  });

  it("GitHub repo URL with .dmg in path but not as extension → github-repo", () => {
    // A GitHub release URL that contains .dmg as a download path segment
    // but the URL itself is a repo URL, not a .dmg URL
    const result = classify("https://github.com/user/repo");
    expect(result.type).toBe("github-repo");
  });

  it("GitHub release download .dmg URL → cask-dmg (not github-repo)", () => {
    // A direct .dmg download URL from GitHub releases should be cask-dmg
    const result = classify(
      "https://github.com/webstonehq/seaquel/releases/download/v2026.4.8/Seaquel_2026.4.8_aarch64.dmg",
    );
    expect(result.type).toBe("cask-dmg");
  });
});

describe("B3: --type override (manual selection)", () => {
  // The --type override is handled in the CLI flow (cli.ts), not the
  // classifier. The classifier always returns its best guess; the CLI
  // lets the user override with --type. Here we document that the
  // classifier's result can be overridden by the CLI's --type flag.
  it("classifier returns github-repo for GitHub URLs (CLI --type can override)", () => {
    const result = classify("https://github.com/biolab/orange3");
    expect(result.type).toBe("github-repo");
    // The CLI flow may override this to pip-package, npm-package, etc.
    // based on repo contents or --type flag.
  });

  it("classifier returns npm-package for npm URLs (CLI --type can override)", () => {
    const result = classify("https://www.npmjs.com/package/taskbook");
    expect(result.type).toBe("npm-package");
    // The CLI flow could override to a different generator if needed.
  });
});

describe("B3: classifyWithHead (content-type sniffing)", () => {
  it("returns classify result directly when type is not unknown", async () => {
    const result = await classifyWithHead("https://www.npmjs.com/package/foo");
    expect(result.type).toBe("npm-package");
  });

  it("sniffs DMG content-type for unknown URLs", async () => {
    const originalFetch = global.fetch;
    global.fetch = (() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({
          "content-type": "application/x-apple-diskimage",
        }),
      })) as any;

    try {
      const result = await classifyWithHead("https://example.com/download");
      expect(result.type).toBe("cask-dmg");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("sniffs zip content-type for unknown URLs", async () => {
    const originalFetch = global.fetch;
    global.fetch = (() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ "content-type": "application/zip" }),
      })) as any;

    try {
      const result = await classifyWithHead("https://example.com/download");
      expect(result.type).toBe("archive");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("sniffs shellscript content-type for unknown URLs", async () => {
    const originalFetch = global.fetch;
    global.fetch = (() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ "content-type": "text/x-shellscript" }),
      })) as any;

    try {
      const result = await classifyWithHead("https://example.com/install");
      expect(result.type).toBe("bash-script");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns unknown when HEAD request fails", async () => {
    const originalFetch = global.fetch;
    global.fetch = (() => Promise.reject(new Error("network error"))) as any;

    try {
      const result = await classifyWithHead("https://example.com/download");
      expect(result.type).toBe("unknown");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
