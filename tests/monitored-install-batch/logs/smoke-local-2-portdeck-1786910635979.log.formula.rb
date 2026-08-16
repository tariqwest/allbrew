FORMULA_PATH=/Users/th-allbrew/homebrew-allbrew/Casks/portdeck.rb
cask "portdeck" do
  version "0.1.0-beta.17"
  sha256 "b5f72b4fb1f8c3429ad6ecec96b748cda292fb3b3a6d2c6b0458cae4fc65d68f"

  url "https://github.com/JessePeplinski/portdeck/releases/download/v#{version}/PortDeck-#{version}-macos-arm64.dmg"
  name "PortDeck"
  desc "Native macOS menu-bar command center for local development services and deployment status."
  homepage "https://github.com/JessePeplinski/portdeck"

  app "PortDeck.app"

  livecheck do
    url :head
    strategy :github_latest
  end

  zap trash: [
    "~/Library/Application Support/PortDeck",
    "~/Library/Caches/PortDeck",
    "~/Library/Preferences/PortDeck.plist",
  ]
end