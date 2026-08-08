cask "netbar" do
  version "1.2.1"
  sha256 "8e15790adc8ac0a486facff205eeea636c2291d1f9af593d991410973caf2063"

  url "https://github.com/mh-sudo/NetBar/releases/download/v#{version}/NetBar-#{version}.zip"
  name "NetBar"
  desc "NetBar - The fastest , native macOS menu bar app for real-time network speed monitoring. Track upload/download speed, bandwidth usage, and internet speed stats right from your status bar."
  homepage "https://github.com/mh-sudo/NetBar"

  app "NetBar.app"

  livecheck do
    url :head
    strategy :github_latest
  end

  zap trash: [
    "~/Library/Application Support/NetBar",
    "~/Library/Caches/NetBar",
    "~/Library/Preferences/NetBar.plist",
  ]
end
