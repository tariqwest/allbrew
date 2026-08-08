class BartycrouchTap < Formula
  desc "Localization/I18n: Incrementally update/translate your Strings files from .swift, .h, .m(m), .storyboard or .xib files."
  homepage "https://github.com/FlineDev/BartyCrouch"
  license "MIT"
  url "https://api.github.com/repos/FlineDev/BartyCrouch/tarball/4.15.1"
  sha256 "464df8f99491cd243b7653d328f113d7cb518c47904205efa6b1f6b69ead5fee"
  head "https://github.com/FlineDev/BartyCrouch.git", branch: "main"

  livecheck do
    url :head
    strategy :github_latest
  end

  depends_on "swift" => :build

  def install
    system "swift", "build", "--disable-sandbox", "-c", "release"
    bin.install ".build/release/bartycrouch", ".build/release/BartyCrouch"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/bartycrouch --version")
  end
end
