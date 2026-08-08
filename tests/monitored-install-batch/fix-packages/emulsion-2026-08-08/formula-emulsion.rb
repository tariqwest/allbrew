class Emulsion < Formula
  desc "A fast and minimalistic image viewer"
  homepage "https://github.com/ArturKovacs/emulsion"
  license "MIT"
  url "https://static.crates.io/crates/emulsion/emulsion-12.0.0.crate"
  sha256 "d0417999f68154dfa850c0c6b830ec6493e578c65275178752d80cfe884d66d6"
  version "12.0.0"
  head "https://github.com/ArturKovacs/emulsion.git", branch: "main"

  livecheck do
    url "https://crates.io/api/v1/crates/emulsion"
    regex(/"(?:max_stable_version|newest_version)"\s*:\s*"v?([^"\\]+)"/i)
  end

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/emulsion --version")
  end
end
