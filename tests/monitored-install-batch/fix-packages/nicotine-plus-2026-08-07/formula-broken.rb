class NicotinePlusTap < Formula
  desc "Graphical client for the Soulseek peer-to-peer network"
  homepage "https://nicotine-plus.org"
  license "GPL-3.0-only"
  version "3.3.10"

  on_macos do
    on_arm do
      url "https://github.com/nicotine-plus/nicotine-plus/releases/download/#{version}/macos-arm64-installer.zip"
      sha256 "ae752794c8b8683ed47ce3c45e1cd55730179c04ca214dfe625a404f5af37b45"
    end
    on_intel do
      url "https://github.com/nicotine-plus/nicotine-plus/releases/download/#{version}/macos-x86_64-installer.zip"
      sha256 "4468a768417544ea64c2f68473162730e4758c70854beccec4a716cf34ed7de1"
    end
  end

  livecheck do
    url :stable
    strategy :github_latest
  end

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"nicotine+-3.3.10.dmg" => "nicotine-plus"
    bin.install_symlink libexec/"nicotine+-3.3.10.dmg" => "nicotine+-3.3.10.dmg"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/nicotine-plus --version")
  end
end
