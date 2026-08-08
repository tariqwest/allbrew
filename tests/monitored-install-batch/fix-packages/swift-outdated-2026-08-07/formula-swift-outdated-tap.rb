class SwiftOutdatedTap < Formula
  desc "A swift subcommand for displaying when your dependencies (SwiftPM or Xcode) are out of date"
  homepage "https://github.com/kiliankoe/swift-outdated"
  license "MIT"
  version "0.15.3"

  on_macos do
    on_arm do
      url "https://github.com/kiliankoe/swift-outdated/releases/download/#{version}/swift-outdated-#{version}-macos.zip"
      sha256 "3b3aa31e1742897cee9723f204d4a1276213c4104b1447df71822bb7e08a7f21"
    end
    on_intel do
      url "https://github.com/kiliankoe/swift-outdated/releases/download/#{version}/swift-outdated-#{version}-macos.zip"
      sha256 "3b3aa31e1742897cee9723f204d4a1276213c4104b1447df71822bb7e08a7f21"
    end
  end

  livecheck do
    url :stable
    strategy :github_latest
  end

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"swift-outdated-#{version}-macos/swift-outdated" => "swift-outdated"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/swift-outdated --version")
  end
end
