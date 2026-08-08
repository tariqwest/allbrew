class PnpmTap < Formula
  desc "Fast, disk space efficient package manager"
  homepage "https://pnpm.io"
  url "https://registry.npmjs.org/pnpm/-/pnpm-11.20.0.tgz"
  sha256 "34e198cb1e43237517ecedfd31f9ae26a6c0a3e5366ce58a2d05f4b21fb5f19a"
  license "MIT"

  livecheck do
    url "https://registry.npmjs.org/pnpm/latest"
    regex(/"version"\s*:\s*"v?([^"\\]+)"/i)
  end

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args, "--min-release-age=0"
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/pnpm --version")
  end
end
