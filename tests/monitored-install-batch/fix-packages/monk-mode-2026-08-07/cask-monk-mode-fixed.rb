cask "monk-mode" do
  version "0.1.0"
  sha256 "a59a6466a106f40b494b43aac67abd18fb4c773fb9e84948a71e771dcc0abde1"

  url "https://mac.monk-mode.lifestyle/downloads/MonkMode_0.1.0_aarch64.dmg"
  name "MonkMode"
  desc "Install from https://mac.monk-mode.lifestyle/downloads/MonkMode_0.1.0_aarch64.dmg"

  livecheck do
    url "https://mac.monk-mode.lifestyle/downloads/MonkMode_0.1.0_aarch64.dmg"
    strategy :header_match
    regex(/(\d+(?:\.\d+)+)/)
  end

  app "MonkMode.app"
end
