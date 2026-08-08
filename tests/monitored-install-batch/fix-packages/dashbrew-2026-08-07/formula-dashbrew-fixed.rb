class Dashbrew < Formula
  desc "TUI dashboard builder that lets you visualize data from scripts and APIs right in your console"
  homepage "https://github.com/rasjonell/dashbrew/wiki"
  license "MIT"
  url "https://api.github.com/repos/rasjonell/dashbrew/tarball/v1.1.0"
  sha256 "ed97b3c1b8d9edc91a48400aaf19e73b48b567bcb427847d4ee08c06960473aa"
  head "https://github.com/rasjonell/dashbrew.git", branch: "master"

  livecheck do
    url "https://proxy.golang.org/github.com/rasjonell/dashbrew/@latest"
    regex(/"Version"\s*:\s*"v?([^"\\]+)"/i)
  end

  depends_on "go" => :build

  def install
    system "go", "build", *std_go_args(ldflags: "-s -w"), "./cmd/dashbrew"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/dashbrew --version")
  end
end
