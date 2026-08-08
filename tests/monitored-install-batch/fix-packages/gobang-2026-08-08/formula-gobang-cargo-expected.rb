class Gobang < Formula
  desc "A cross-platform TUI database management tool written in Rust"
  homepage "https://github.com/TaKO8Ki/gobang"
  license "MIT"
  url "https://api.github.com/repos/TaKO8Ki/gobang/tarball/v0.1.0-alpha.5"
  sha256 "b345583ac70e7ec449cedb29a2e5a9344990859b6e686b0b01d15ad62f5ea8e1"
  head "https://github.com/TaKO8Ki/gobang.git", branch: "main"

  livecheck do
    url :head
    strategy :github_latest
  end

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/gobang --version")
  end
end
