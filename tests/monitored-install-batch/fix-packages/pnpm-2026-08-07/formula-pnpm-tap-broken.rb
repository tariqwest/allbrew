class PnpmTap < Formula
  desc "Install from https://get.pnpm.io/install.sh"
  homepage "https://get.pnpm.io/install.sh"
  url "https://get.pnpm.io/install.sh"
  version "0.0.1"
  sha256 "ab8b2166653269b1182ae8ae03801b6c651fae56a0ca9e011d5d5d5aac0f056b"

  livecheck do
    url "https://get.pnpm.io/install.sh"
    strategy :header_match
    regex(/(\d+(?:\.\d+)+)/)
  end

  def install
    ENV["PREFIX"] = prefix.to_s
    ENV["DESTDIR"] = prefix.to_s
    ENV["HOME"] = buildpath.to_s
    system "bash", cached_download.to_s
    bin.install Dir[buildpath/"bin/*"] if (buildpath/"bin").exist?
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/pnpm --version")
  end
end
