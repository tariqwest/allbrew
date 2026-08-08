class OhMyZsh < Formula
  desc "Install from https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh"
  homepage "https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh"
  url "https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh"
  version "0.0.1"
  sha256 "95118b50d062198597e2b73d3a57b609fd95ca68cdc86faf4460d955f0172b61"

  livecheck do
    url "https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh"
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
    assert_match version.to_s, shell_output("#{bin}/oh-my-zsh --version")
  end
end
