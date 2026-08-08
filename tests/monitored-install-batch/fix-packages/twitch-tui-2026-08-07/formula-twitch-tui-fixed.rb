class TwitchTui < Formula
  desc "Twitch chat in the terminal."
  homepage "https://github.com/Xithrius/twitch-tui"
  license "Apache-2.0"
  url "https://static.crates.io/crates/twitch-tui/twitch-tui-2.6.19.crate"
  sha256 "51804e3db16d1620bb6bd2014eb13b6c7b3b77e3b8201993e7638bac8b6f26ce"
  version "2.6.19"
  head "https://github.com/Xithrius/twitch-tui.git", branch: "main"

  livecheck do
    url "https://crates.io/api/v1/crates/twitch-tui"
    regex(/"(?:max_stable_version|newest_version)"\s*:\s*"v?([^"\\]+)"/i)
  end

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/twt --version")
  end
end
