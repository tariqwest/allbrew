class Managarr < Formula
  desc "A TUI and CLI to manage your Servarrs"
  homepage "https://github.com/Dark-Alex-17/managarr"
  license "MIT"
  url "https://static.crates.io/crates/managarr/managarr-0.7.3.crate"
  sha256 "8b870944ab9cd76084392bf9d425623e0a14f60b4864314855aca1a7a6cf5442"
  version "0.7.3"
  head "https://github.com/Dark-Alex-17/managarr.git", branch: "main"

  livecheck do
    url "https://crates.io/api/v1/crates/managarr"
    regex(/"(?:max_stable_version|newest_version)"\s*:\s*"v?([^"\\]+)"/i)
  end

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/managarr --version")
  end
end
