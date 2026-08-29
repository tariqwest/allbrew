FORMULA_PATH=/Users/th-allbrew/homebrew-allbrew/Formula/goshot.rb
class Goshot < Formula
  desc "Convenient screenshot program that is quick, allows for very simple  editing (arrows, circles, text boxes) and exports to easily shareable formats (Google Drive, MS OneDrive, Dropbox, clipboard) with as few clicks as possible."
  homepage "https://github.com/janpfeifer/goshot"
  license "Apache-2.0"
  url "https://api.github.com/repos/janpfeifer/goshot/tarball/v0.1.4"
  sha256 "bdc804926f54b1a30141aadec7c2edb8fc0ea21a7514d4991e4dc14ccddfa4aa"
  head "https://github.com/janpfeifer/goshot.git", branch: "main"

  livecheck do
    url "https://proxy.golang.org/github.com/janpfeifer/goshot/@latest"
    regex(/"Version"\s*:\s*"v?([^"\\]+)"/i)
  end

  depends_on "go" => :build

  def install
    system "go", "build", *std_go_args(ldflags: "-s -w")
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/goshot --version")
  end
end