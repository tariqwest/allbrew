class Nostui < Formula
  desc "A TUI client for Nostr"
  homepage "https://github.com/akiomik/nostui"
  license "MIT"
  url "https://static.crates.io/crates/nostui/nostui-0.1.1.crate"
  sha256 "ab648b89eaffed5287cbc260049b03952bfd6532c80b29b2786d88708ad35fbd"
  version "0.1.1"
  head "https://github.com/akiomik/nostui.git", branch: "main"

  livecheck do
    url "https://crates.io/api/v1/crates/nostui"
    regex(/"(?:max_stable_version|newest_version)"\s*:\s*"v?([^"\\]+)"/i)
  end

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/nostui --version")
  end
end
