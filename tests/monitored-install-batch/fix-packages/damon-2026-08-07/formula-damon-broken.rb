FORMULA_PATH=/Users/th-allbrew/homebrew-allbrew/Formula/damon.rb
class Damon < Formula
  desc "A terminal UI (TUI) for HashiCorp Nomad"
  homepage "https://github.com/hashicorp/damon"
  license "MPL-2.0"
  head "https://github.com/hashicorp/damon.git", branch: "main"

  livecheck do
    url :head
    strategy :github_latest
  end

  def install
    system "make", "PREFIX=#{prefix}", "install"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/damon --version")
  end
end