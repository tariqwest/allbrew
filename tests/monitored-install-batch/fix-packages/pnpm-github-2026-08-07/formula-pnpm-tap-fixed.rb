class PnpmTap < Formula
  desc "Fast, disk space efficient package manager"
  homepage "https://pnpm.io"
  license "MIT"
  version "11.20.0"

  on_macos do
    on_arm do
      url "https://github.com/pnpm/pnpm/releases/download/v#{version}/pnpm-darwin-arm64.tar.gz"
      sha256 "4bc97fea72e5c92eec1fefc8d410c35d01e0d0d52f3160c59f38c32db58b5cd2"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/pnpm/pnpm/releases/download/v#{version}/pnpm-linux-arm64.tar.gz"
      sha256 "f00fc2041bb41742b7943bf2bb24183ad20320e8384824a8031eb94edf2f57a5"
    end
    on_intel do
      url "https://github.com/pnpm/pnpm/releases/download/v#{version}/pnpm-linux-x64.tar.gz"
      sha256 "b4ad6ad2b21db2f8cd50af416c3aa148ba704c31c84893f465a770a01c2c4572"
    end
  end

  livecheck do
    url :stable
    strategy :github_latest
  end

  def install
    bin.install "pnpm"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/pnpm --version")
  end
end
