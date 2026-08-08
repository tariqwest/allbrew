class Damon < Formula
  desc "A terminal UI (TUI) for HashiCorp Nomad"
  homepage "https://github.com/hashicorp/damon"
  license "MPL-2.0"
  head "https://github.com/hashicorp/damon.git", branch: "main"

  livecheck do
    url "https://proxy.golang.org/github.com/hashicorp/damon/@latest"
    regex(/"Version"\s*:\s*"v?([^"\\]+)"/i)
  end

  depends_on "go" => :build

  def install
    system "go", "build", *std_go_args(ldflags: "-s -w"), "./cmd/damon"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/damon --version")
  end
end
