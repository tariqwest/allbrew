class Shiori < Formula
  desc "Simple bookmark manager built with Go"
  homepage "https://github.com/go-shiori/shiori"
  license "MIT"
  version "1.8.0"

  on_macos do
    on_arm do
      url "https://github.com/go-shiori/shiori/releases/download/v#{version}/shiori_Darwin_aarch64_1.8.0.tar.gz"
      sha256 "5c4acf285902ce96eb35f2b20877fde9692c26ebf47c1b7719faf19864362a63"
    end
    on_intel do
      url "https://github.com/go-shiori/shiori/releases/download/v#{version}/shiori_Darwin_x86_64_1.8.0.tar.gz"
      sha256 "d0a8f9fa2e3cc732fd1a21de661be62d3cd8ebbed74f4419153cf0e9f269be23"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/go-shiori/shiori/releases/download/v#{version}/shiori_Linux_aarch64_1.8.0.tar.gz"
      sha256 "ebfb94cc5ab955f379ec3af0b7194191f3989096ad37e7cb59e9ef3c12528fba"
    end
    on_intel do
      url "https://github.com/go-shiori/shiori/releases/download/v#{version}/shiori_Linux_x86_64_1.8.0.tar.gz"
      sha256 "20552c4d91c720dc9786d73a7f5b68abd9ed32addb177861f89ea5d4e5937d3f"
    end
  end

  livecheck do
    url :stable
    strategy :github_latest
  end

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"shiori" => "shiori"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/shiori --version")
  end
end
