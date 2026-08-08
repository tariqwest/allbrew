import { describe, it, expect } from "bun:test";
import { classifyWithHead } from "../../lib/classifier.ts";
import {
  analyzeInstallScript,
  assertInstallScriptInScope,
} from "../../lib/install-script-analyze.ts";
import { extractCandidatesFromHtml } from "../../lib/page-discover.ts";

describe("nix install script classification", () => {
  it("classifyWithHead: text/plain shebang → bash-script", async () => {
    const body = "#!/bin/sh\n# installs Nix\necho hi\n";
    const originalFetch = global.fetch;
    global.fetch = (async (_input: any, init?: any) => {
      const method = (init?.method || "GET").toUpperCase();
      if (method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }) as any;

    try {
      const result = await classifyWithHead("https://example.com/nix/install");
      expect(result.type).toBe("bash-script");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("page-discover drops $system archive placeholders", () => {
    const html = `
      <a href="https://releases.nixos.org/nix/nix-2.35.1/nix-2.35.1-$system.tar.xz">tarball</a>
      <a href="https://example.com/tool.sh">ok</a>
    `;
    const cands = extractCandidatesFromHtml(html, "https://nixos.org/download/");
    expect(cands.some((c) => c.url.includes("$system"))).toBe(false);
    expect(cands.some((c) => c.url.endsWith("tool.sh"))).toBe(true);
  });

  it("analyzeInstallScript flags official nix multi-user installer", () => {
    const body = `#!/bin/sh
# This script installs the Nix package manager on your system by
# downloading a binary distribution and running its installer script
# (which in turn creates and populates /nix).
url=https://releases.nixos.org/nix/nix-2.35.1/nix-2.35.1-$system.tar.xz
`;
    const a = analyzeInstallScript("https://nixos.org/nix/install", body);
    expect(a.kind).toBe("system-wide-out-of-scope");
    expect(a.packageHint).toBe("nix");
    expect(() =>
      assertInstallScriptInScope("https://nixos.org/nix/install", body),
    ).toThrow(/out of scope|system-wide|multi-user|\/nix/i);
  });

  it("analyzeInstallScript allows ordinary PREFIX scripts", () => {
    const body = `#!/bin/sh
PREFIX=\${PREFIX:-/usr/local}
install -m 755 bin/foo "$PREFIX/bin/foo"
`;
    const a = analyzeInstallScript("https://example.com/install.sh", body);
    expect(a.kind).toBe("prefix-ok");
  });
});
