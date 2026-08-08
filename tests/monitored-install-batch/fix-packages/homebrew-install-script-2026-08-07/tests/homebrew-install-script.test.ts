import { describe, expect, it } from "bun:test";
import {
  analyzeInstallScript,
  assertInstallScriptInScope,
} from "../files/install-script-analyze.ts";

const HB_URL =
  "https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh";

const HB_BODY_SNIPPET = `#!/bin/bash
# Fail fast
if [ -z "\${BASH_VERSION:-}" ]
then
  abort "Bash is required to interpret this script."
fi
if [[ -f "/etc/homebrew/brew.no_install" ]]
then
  abort "Homebrew cannot be installed because /etc/homebrew/brew.no_install exists!"
fi
HOMEBREW_PREFIX="/opt/homebrew"
HOMEBREW_REPOSITORY="\${HOMEBREW_PREFIX}/Homebrew"
# git clone https://github.com/Homebrew/brew
sudo mkdir -p /opt/homebrew
`;

describe("homebrew install script OOS", () => {
  it("flags official Homebrew/install URL + bootstrap body", () => {
    const a = analyzeInstallScript(HB_URL, HB_BODY_SNIPPET);
    expect(a.kind).toBe("system-wide-out-of-scope");
    expect(a.packageHint).toBe("homebrew");
    expect(() => assertInstallScriptInScope(HB_URL, HB_BODY_SNIPPET)).toThrow(
      /out of scope|Homebrew bootstrap|meta-recursive|brew\.sh/i,
    );
  });

  it("allows ordinary PREFIX scripts", () => {
    const body = `#!/bin/sh
PREFIX=\${PREFIX:-/usr/local}
install -m 755 bin/foo "$PREFIX/bin/foo"
`;
    const a = analyzeInstallScript("https://example.com/foo/install.sh", body);
    expect(a.kind).toBe("prefix-ok");
  });
});
