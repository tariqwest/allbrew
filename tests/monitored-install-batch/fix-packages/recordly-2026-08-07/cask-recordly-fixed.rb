cask "recordly" do
  version "1.3.3"
  sha256 "7fa8f4116e870d40fd78bb36d2ad20af364c945023b7b5ec3e72b568b6bbdee5"

  url "https://github.com/webadderallorg/Recordly/releases/download/v1.3.3/Recordly-arm64.dmg"
  name "Recordly.app"
  desc "Install from https://github.com/webadderallorg/Recordly/releases/download/v1.3.3/Recordly-arm64.dmg"

  livecheck do
    url "https://github.com/webadderallorg/Recordly/releases/download/v1.3.3/Recordly-arm64.dmg"
    strategy :header_match
    regex(/(\d+(?:\.\d+)+)/)
  end

  app "Recordly.app"
end
