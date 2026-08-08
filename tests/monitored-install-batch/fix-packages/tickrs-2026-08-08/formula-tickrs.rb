class Tickrs < Formula
  desc "Realtime ticker data in your terminal 📈"
  homepage "https://github.com/tarkah/tickrs"
  license "MIT"
  url "https://api.github.com/repos/tarkah/tickrs/tarball/v0.15.0"
  sha256 "fd1c0b43e8d861c5ffe6ef15ad830d59d8052a3fe0e815dc2c2705cf6f5664ad"
  head "https://github.com/tarkah/tickrs.git", branch: "master"

  livecheck do
    url "https://crates.io/api/v1/crates/tickrs"
    regex(/"(?:max_stable_version|newest_version)"\s*:\s*"v?([^"\\]+)"/i)
  end

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/tickrs --version")
  end
end
