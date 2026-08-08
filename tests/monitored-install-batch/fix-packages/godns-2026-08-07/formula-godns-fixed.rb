class GodnsTap < Formula
  desc "A dynamic DNS client tool that supports AliDNS, Cloudflare, Google Domains, DNSPod, HE.net & DuckDNS & DreamHost, etc, written in Go."
  homepage "https://github.com/TimothyYe/godns"
  license "Apache-2.0"
  version "3.4.3"

  on_macos do
    on_arm do
      url "https://github.com/TimothyYe/godns/releases/download/v#{version}/godns_#{version}_darwin_arm64.tar.gz"
      sha256 "f1ec6330a887df15470462cb5feb8c8080eeac973c9bef9759ca4f071b442ef3"
    end
    on_intel do
      url "https://github.com/TimothyYe/godns/releases/download/v#{version}/godns_#{version}_darwin_amd64.tar.gz"
      sha256 "1b13e5d4ef7fa48b5b5bb09a5b3a1879d2467e3b4df9bc29a6aa52c773e65cf1"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/TimothyYe/godns/releases/download/v#{version}/godns_#{version}_linux_arm64.tar.gz"
      sha256 "7b8c0f5b9ff60b4a1904e84056677196bf39c0525f9f8c40adaf9756c1a3c244"
    end
    on_intel do
      url "https://github.com/TimothyYe/godns/releases/download/v#{version}/godns_#{version}_linux_amd64.tar.gz"
      sha256 "a36a077a02927db4a5ae4e8ff821c8f566122cbd318d07ef592d8b21b3f827e2"
    end
  end

  livecheck do
    url :stable
    strategy :github_latest
  end

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"godns" => "godns"
  end

  service do
    run opt_bin/"godns"
    keep_alive true
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/godns --version")
  end
end
