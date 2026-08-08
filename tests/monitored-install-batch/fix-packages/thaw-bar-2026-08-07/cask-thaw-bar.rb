cask "thaw-bar" do
  version "2.0.0-rc.2.1"
  sha256 "777c45cc0cca14f49907097d476a5beccb70095336ff9abc35ce63041091476c"

  url "https://github.com/thaw-app/Thaw/releases/download/#{version}/Thaw.dmg"
  name "Thaw"
  desc "The menu bar manager for macOS"
  homepage "https://github.com/thaw-app/Thaw"

  app "Thaw.app"

  livecheck do
    url :head
    strategy :github_latest
  end

  zap trash: [
    "~/Library/Application Support/Thaw",
    "~/Library/Caches/Thaw",
    "~/Library/Preferences/Thaw.plist",
  ]
end
