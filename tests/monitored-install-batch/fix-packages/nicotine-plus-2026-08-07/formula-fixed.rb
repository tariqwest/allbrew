cask "nicotine-plus" do
  version "3.3.10"
  sha256 "ae752794c8b8683ed47ce3c45e1cd55730179c04ca214dfe625a404f5af37b45"

  url "https://github.com/nicotine-plus/nicotine-plus/releases/download/#{version}/macos-arm64-installer.zip"
  name "Nicotine+"
  desc "Graphical client for the Soulseek peer-to-peer network"
  homepage "https://nicotine-plus.org"

  container nested: "nicotine+-#{version}.dmg"
  app "Nicotine+.app"

  livecheck do
    url :head
    strategy :github_latest
  end

  zap trash: [
    "~/Library/Application Support/Nicotine+",
    "~/Library/Caches/Nicotine+",
    "~/Library/Preferences/Nicotine+.plist",
  ]
end
