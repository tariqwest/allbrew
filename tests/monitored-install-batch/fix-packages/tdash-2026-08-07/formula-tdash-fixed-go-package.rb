class Tdash < Formula
  desc "A terminal dashboard with stats from Google Analytics, GitHub, Travis CI, and Jenkins. Very much built specific to me."
  homepage "https://github.com/jessfraz/tdash"
  license "MIT"
  url "https://api.github.com/repos/jessfraz/tdash/tarball/v0.5.5"
  sha256 "9ce4ec92a7a87dbb7ebb99633b4d5ebfe5f496047b084a2b8256b92cefedb8e4"
  head "https://github.com/jessfraz/tdash.git", branch: "master"

  livecheck do
    url "https://proxy.golang.org/github.com/jessfraz/tdash/@latest"
    regex(/"Version"\s*:\s*"v?([^"\\]+)"/i)
  end

  depends_on "go" => :build

  def install
    system "go", "build", *std_go_args(ldflags: "-s -w")
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/tdash --version")
  end
end
