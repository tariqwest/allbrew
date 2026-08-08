class AichatTap < Formula
  desc "All-in-one LLM CLI Tool"
  homepage "https://github.com/sigoden/aichat"
  license "MIT OR Apache-2.0"
  url "https://static.crates.io/crates/aichat/aichat-0.30.0.crate"
  sha256 "74e008beab12eab20ff2bfe7a893c7165d9e121a410f8a4c449fe81bfcff5f59"
  version "0.30.0"
  head "https://github.com/sigoden/aichat.git", branch: "main"

  livecheck do
    url "https://crates.io/api/v1/crates/aichat"
    regex(/"(?:max_stable_version|newest_version)"\s*:\s*"v?([^"\\]+)"/i)
  end

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/aichat --version")
  end
end
