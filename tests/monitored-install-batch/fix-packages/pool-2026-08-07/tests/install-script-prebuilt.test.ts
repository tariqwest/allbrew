import { describe, expect, test } from "bun:test";
import {
  analyzeInstallScript,
  detectPrebuiltBinaryPlan,
  expandArchiveTemplate,
} from "../../lib/install-script-analyze.ts";

const POOL_SNIPPET = `#!/bin/sh
set -eu
BASE_URL="https://downloads.poolside.ai/pool"
INSTALL_DIR="\${POOL_INSTALL_DIR:-\${XDG_BIN_HOME:-\$HOME/.local/bin}}"
ACCEPT_EULA="\${POOL_INSTALL_ACCEPT_EULA:-0}"
main() {
  os="$(detect_os)"
  arch="$(detect_arch)"
  version="$(resolve_version "\${1:-latest}")"
  archive="pool-\${os}-\${arch}.tar.gz"
  url="\${BASE_URL}/\${version}/\${archive}"
  binary="\$tmpdir/pool-\${os}-\${arch}"
  mv "\$binary" "\$INSTALL_DIR/pool"
}
resolve_version() {
  if [ "\$1" = "latest" ]; then
    v="$(download_stdout "\${BASE_URL}/pool-latest-version.txt")"
    echo "\$v"
  else
    echo "\$1"
  fi
}
`;

describe("install-script-analyze prebuilt", () => {
  test("detects poolside prebuilt plan", () => {
    const plan = detectPrebuiltBinaryPlan(POOL_SNIPPET, {
      url: "https://downloads.poolside.ai/pool/install.sh",
      name: "pool",
    });
    expect(plan).not.toBeNull();
    expect(plan!.baseUrl).toBe("https://downloads.poolside.ai/pool");
    expect(plan!.archiveTemplate).toBe("pool-{os}-{arch}.tar.gz");
    expect(plan!.versionUrl).toContain("pool-latest-version.txt");
    expect(plan!.binName).toBe("pool");
    expect(
      expandArchiveTemplate(plan!.archiveTemplate, "darwin", "arm64"),
    ).toBe("pool-darwin-arm64.tar.gz");
  });

  test("marks home-dir installer", () => {
    const a = analyzeInstallScript(POOL_SNIPPET, { name: "pool" });
    expect(a.homeDirInstaller).toBe(true);
    expect(a.usesPrefix).toBe(false);
    expect(a.installDirEnvKeys).toContain("POOL_INSTALL_DIR");
  });

  test("returns null without archive template", () => {
    const plan = detectPrebuiltBinaryPlan(
      'BASE_URL="https://example.com"\necho hi\n',
      {},
    );
    expect(plan).toBeNull();
  });
});
