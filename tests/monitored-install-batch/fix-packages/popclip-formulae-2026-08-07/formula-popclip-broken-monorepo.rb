FORMULA_PATH=/Users/th-allbrew/homebrew-allbrew/Formula/popclip.rb
class Popclip < Formula
  desc "🍻 A CLI workflow for the administration of macOS applications distributed as binaries"
  homepage "https://brew.sh"
  license "BSD-2-Clause"
  url "https://api.github.com/repos/Homebrew/homebrew-cask/tarball/v0.60.1"
  sha256 "e2e6bb6eef10f8012708904c49da67629d4435a3e83d5fa9ff6fdf5b34374275"
  head "https://github.com/Homebrew/homebrew-cask.git", branch: "main"

  livecheck do
    url :head
    strategy :github_latest
  end

  def install
    system "make", "PREFIX=#{prefix}", "install"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/popclip --version")
  end
end