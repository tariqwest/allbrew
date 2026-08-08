class FlyIoCli < Formula
  desc "Install from https://fly.io/install.sh"
  homepage "https://fly.io/install.sh"
  url "https://fly.io/install.sh"
  version "0.0.1"
  sha256 "a031272948eaca6c064a0756e4f43b0b3ee687716eeed2ab858fe0bdb0f029f5"

  livecheck do
    url "https://fly.io/install.sh"
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
    assert_match version.to_s, shell_output("#{bin}/fly-io-cli --version")
  end
end
