FORMULA_PATH=/Users/th-allbrew/homebrew-allbrew/Formula/gobang.rb
class Gobang < Formula
  desc "A cross-platform TUI database management tool written in Rust"
  homepage "https://github.com/TaKO8Ki/gobang"
  license "MIT"
  version "0.1.0-alpha.5"

  on_macos do
    on_intel do
      url "https://github.com/TaKO8Ki/gobang/releases/download/v#{version}/gobang-0.1.0-alpha.5-x86_64-apple-darwin.tar.gz"
      sha256 "36679a7dac88788ad951ebdcdc9be304865a43c3ef2af0362dcb1984d2fde13a"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/TaKO8Ki/gobang/releases/download/v#{version}/gobang-0.1.0-alpha.5-x86_64-unknown-linux-musl.tar.gz"
      sha256 "29b8f517937cf19691c6e594a0789fe80a528fff05c346883af0e2950b9b90ef"
    end
  end

  livecheck do
    url :stable
    strategy :github_latest
  end

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"gobang-0.1.0-alpha.5-x86_64-apple-darwin/gobang" => "gobang"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/gobang --version")
  end
end