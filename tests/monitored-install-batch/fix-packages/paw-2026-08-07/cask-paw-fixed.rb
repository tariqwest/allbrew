cask "paw" do
  version "0.27.0"
  sha256 "25ef45c37dd99d4b5d90bcd7f7703e3412d3c6357c85f03673c97fa66552b282"

  url "https://github.com/lucor/paw/releases/download/v#{version}/paw-0.27.0-macos-arm64.zip"
  name "Paw"
  desc " Simple, modern and privacy-focused open source password manager"
  homepage "https://paw.pm"

  app "Paw.app"

  livecheck do
    url :head
    strategy :github_latest
  end

  zap trash: [
    "~/Library/Application Support/Paw",
    "~/Library/Caches/Paw",
    "~/Library/Preferences/Paw.plist",
  ]
end
