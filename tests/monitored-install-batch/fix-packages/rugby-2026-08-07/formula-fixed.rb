class Rugby < Formula
  desc "🏈 Cache CocoaPods for faster rebuild and indexing Xcode project."
  homepage "https://swiftyfinch.github.io/tags/rugby/"
  license "MIT"
  version "2.10.3"

  on_macos do
    on_arm do
      url "https://github.com/swiftyfinch/Rugby/releases/download/#{version}/universal.zip"
      sha256 "3a674fe74069292fd9266a234935f1eebed310a81d62c2f1fc61d508f22db250"
    end
    on_intel do
      url "https://github.com/swiftyfinch/Rugby/releases/download/#{version}/universal.zip"
      sha256 "3a674fe74069292fd9266a234935f1eebed310a81d62c2f1fc61d508f22db250"
    end
  end

  livecheck do
    url :stable
    strategy :github_latest
  end

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"rugby" => "rugby"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/rugby --version")
  end
end
