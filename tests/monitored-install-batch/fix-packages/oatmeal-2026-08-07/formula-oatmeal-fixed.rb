class Oatmeal < Formula
  desc "Terminal UI to chat with large language models (LLM) using different model backends, and direct integrations with your favourite editors!"
  homepage "https://github.com/dustinblackman/oatmeal"
  license "MIT"
  url "https://static.crates.io/crates/oatmeal/oatmeal-0.13.0.crate"
  sha256 "3b4dfda72057036f86a64dc715aec7c2a681c9feac7d416099c9ac73adabb77d"
  version "0.13.0"
  head "https://github.com/dustinblackman/oatmeal.git", branch: "main"

  livecheck do
    url "https://crates.io/api/v1/crates/oatmeal"
    regex(/"(?:max_stable_version|newest_version)"\s*:\s*"v?([^"\\]+)"/i)
  end

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/oatmeal --version")
  end
end
