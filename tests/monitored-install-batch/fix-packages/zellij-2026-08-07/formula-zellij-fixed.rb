class Zellij < Formula
  desc "A terminal workspace with batteries included"
  homepage "https://zellij.dev"
  license "MIT"
  version "0.44.3"

  on_macos do
    on_arm do
      url "https://github.com/zellij-org/zellij/releases/download/v#{version}/zellij-no-web-aarch64-apple-darwin.tar.gz"
      sha256 "111e15402c73474003ff62b4577c415af1966891bddfc6e5a89b4f33b353c720"
    end
    on_intel do
      url "https://github.com/zellij-org/zellij/releases/download/v#{version}/zellij-x86_64-apple-darwin.tar.gz"
      sha256 "59f803faa32cd4e5f316f0dc2d3b7a5530a72553e38ad939286471848a418eeb"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/zellij-org/zellij/releases/download/v#{version}/zellij-no-web-aarch64-unknown-linux-musl.tar.gz"
      sha256 "9a92b94ba52e2b03f3a071a978d90922693221fa8ed59fd7f4819fe90e431996"
    end
    on_intel do
      url "https://github.com/zellij-org/zellij/releases/download/v#{version}/zellij-x86_64-unknown-linux-musl.tar.gz"
      sha256 "0f7c346788627f506c0a28296517768633cff24fc822a739f8264b640ecad751"
    end
  end

  livecheck do
    url :stable
    strategy :github_latest
  end

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"zellij" => "zellij"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/zellij --version")
  end
end
