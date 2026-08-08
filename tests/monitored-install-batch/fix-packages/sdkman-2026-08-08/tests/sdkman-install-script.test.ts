import { describe, expect, it } from "bun:test";
import { classifyWithHead } from "../../lib/classifier.ts";
import {
  analyzeInstallScript,
  packageHintFromInstallUrl,
} from "../../lib/install-script-analyze.ts";

const SDKMAN_URL = "https://get.sdkman.io";

const SDKMAN_BODY = [
  "#!/bin/bash",
  "# install:- channel: stable; cliVersion: 5.23.0; api: https://api.sdkman.io/2",
  'export SDKMAN_SERVICE="https://api.sdkman.io/2"',
  'export SDKMAN_VERSION="5.23.0"',
  'if [ -z "$SDKMAN_DIR" ]; then',
  '    SDKMAN_DIR="$HOME/.sdkman"',
  "fi",
  "export SDKMAN_DIR",
  '[[ -s "${SDKMAN_DIR_RAW}/bin/sdkman-init.sh" ]] && source "${SDKMAN_DIR_RAW}/bin/sdkman-init.sh"',
  'echo "sdkman_auto_answer=false" >> "$sdkman_config_file"',
].join("\n");

describe("sdkman install script", () => {
  it("packageHintFromInstallUrl maps get.sdkman.io → sdkman", () => {
    expect(packageHintFromInstallUrl(SDKMAN_URL)).toBe("sdkman");
    expect(packageHintFromInstallUrl("https://sdkman.io/install")).toBe("sdkman");
  });

  it("analyzeInstallScript marks sdkman as home-dir-installer", () => {
    const a = analyzeInstallScript(SDKMAN_URL, SDKMAN_BODY);
    expect(a.kind).toBe("home-dir-installer");
    expect(a.packageHint).toBe("sdkman");
    expect(a.signals).toContain("sdkman-bootstrap");
    expect(String(a.reason)).toMatch(/SDKMAN|sdkman/i);
  });

  it("analyzeInstallScript detects body-only sdkman signals", () => {
    const a = analyzeInstallScript("https://example.com/install.sh", SDKMAN_BODY);
    expect(a.kind).toBe("home-dir-installer");
    expect(a.packageHint).toBe("sdkman");
  });

  it(
    "classifyWithHead sniffs text/plain shebang at get.sdkman.io",
    async () => {
      const r = await classifyWithHead(SDKMAN_URL);
      expect(r.type).toBe("bash-script");
    },
    60_000,
  );
});
