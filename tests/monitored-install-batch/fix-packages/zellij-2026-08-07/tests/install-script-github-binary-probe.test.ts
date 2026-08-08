import { describe, expect, it } from "bun:test";
import { detectGithubBinaryReleaseFromScript } from "../../lib/analyzer.ts";
import { looksLikeShellScript } from "../../lib/classifier.ts";

const ZELLIJ_LAUNCH = `#!/usr/bin/env bash

dir="/tmp/zellij/bootstrap"
mkdir -p "$dir"

if [[ -x "$dir/zellij" ]]
then
    "$dir/zellij" "$@"
    exit
fi

case $(uname -m) in
    "x86_64"|"aarch64")
        arch=$(uname -m)
    ;;
    "arm64")
        arch="aarch64"
    ;;
    *)
        echo "Unsupported cpu arch: $(uname -m)"
        exit 2
    ;;
esac

case $(uname -s) in
    "Linux")
        sys="unknown-linux-musl"
    ;;
    "Darwin")
        sys="apple-darwin"
    ;;
    *)
        echo "Unsupported system: $(uname -s)"
        exit 2
    ;;
esac

url="https://github.com/zellij-org/zellij/releases/latest/download/zellij-$arch-$sys.tar.gz"
curl --location "$url" | tar -C "$dir" -xz
"$dir/zellij" "$@"
exit
`;

describe("looksLikeShellScript", () => {
  it("detects bash shebang", () => {
    expect(looksLikeShellScript(ZELLIJ_LAUNCH)).toBe(true);
  });

  it("rejects random binary-ish text", () => {
    expect(looksLikeShellScript("PK\x03\x04not a script")).toBe(false);
  });
});

describe("detectGithubBinaryReleaseFromScript", () => {
  it("pivots zellij.dev/launch bootstrap to zellij-org/zellij", () => {
    const hit = detectGithubBinaryReleaseFromScript(ZELLIJ_LAUNCH);
    expect(hit).not.toBeNull();
    expect(hit!.owner).toBe("zellij-org");
    expect(hit!.repo).toBe("zellij");
    expect(hit!.confidence).toBe("high");
  });

  it("returns null for generic install scripts without GitHub release assets", () => {
    const script = `#!/bin/bash
set -e
PREFIX=\${PREFIX:-/usr/local}
cp bin/foo "\$PREFIX/bin/"
`;
    expect(detectGithubBinaryReleaseFromScript(script)).toBeNull();
  });

  it("returns null when multiple repos are referenced", () => {
    const script = `#!/bin/bash
curl -L https://github.com/a/b/releases/latest/download/x.tar.gz
curl -L https://github.com/c/d/releases/latest/download/y.tar.gz
`;
    expect(detectGithubBinaryReleaseFromScript(script)).toBeNull();
  });
});
