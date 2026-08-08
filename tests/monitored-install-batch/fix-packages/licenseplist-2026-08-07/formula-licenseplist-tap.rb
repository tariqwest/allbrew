class LicenseplistTap < Formula
  desc "A license list generator of all your dependencies for iOS applications"
  homepage "https://www.slideshare.net/mono0926/licenseplist-a-license-list-generator-of-all-your-dependencies-for-ios-applications"
  license "MIT"
  version "3.28.0"

  on_macos do
    on_arm do
      url "https://github.com/mono0926/LicensePlist/releases/download/#{version}/license-plist.zip"
      sha256 "5ddec07d18a428697ac88747f96691523b04b0412b69d059035f5f2a279b3b66"
    end
    on_intel do
      url "https://github.com/mono0926/LicensePlist/releases/download/#{version}/license-plist.zip"
      sha256 "5ddec07d18a428697ac88747f96691523b04b0412b69d059035f5f2a279b3b66"
    end
  end

  livecheck do
    url :stable
    strategy :github_latest
  end

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"license-plist" => "licenseplist"
    bin.install_symlink libexec/"license-plist" => "license-plist"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/licenseplist --version")
  end
end
