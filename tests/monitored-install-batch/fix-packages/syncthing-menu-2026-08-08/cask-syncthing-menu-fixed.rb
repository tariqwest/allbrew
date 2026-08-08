cask "syncthing-menu" do
  version "0.3.4"
  sha256 "ff4180ab6cc029e8d47696c9c8c568e4b56e7fd1406b8281078fe136df72485e"

  url "https://github.com/gtunes-dev/syncthing-menu/releases/download/v#{version}/SyncthingMenu-#{version}.zip"
  name "Syncthing Menu"
  desc "A frugal, native macOS menu-bar app for Syncthing"
  homepage "https://github.com/gtunes-dev/syncthing-menu"

  app "Syncthing Menu.app"

  livecheck do
    url :head
    strategy :github_latest
  end

  zap trash: [
    "~/Library/Application Support/Syncthing Menu",
    "~/Library/Caches/Syncthing Menu",
    "~/Library/Preferences/Syncthing Menu.plist",
  ]
end
