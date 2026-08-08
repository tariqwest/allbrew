cask "supersonic" do
  version "0.22.0"
  sha256 "352d3d41779357086d4349f26ded3db174a30fe14776b4c55a2a9f6146e7ae11"

  url "https://github.com/supersonic-app/supersonic/releases/download/v#{version}/Supersonic-#{version}-mac-arm64.zip"
  name "Supersonic"
  desc "A lightweight and full-featured cross-platform desktop client for self-hosted music servers"
  homepage "https://github.com/supersonic-app/supersonic"

  app "Supersonic.app"

  livecheck do
    url :head
    strategy :github_latest
  end

  zap trash: [
    "~/Library/Application Support/Supersonic",
    "~/Library/Caches/Supersonic",
    "~/Library/Preferences/Supersonic.plist",
  ]
end
