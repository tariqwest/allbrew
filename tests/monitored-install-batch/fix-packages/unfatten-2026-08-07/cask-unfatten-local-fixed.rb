cask "unfatten" do
  version "1.6"
  sha256 "c1a170cfaa2ce8055ec47530c9d941e10462f0fa1d4cc57de84d4ef5e2c52dc8"

  url "https://avelio.tech/download/Unfatten16.dmg"
  name "Unfatten"
  desc "Install from https://avelio.tech/download/Unfatten16.dmg"

  livecheck do
    url "https://avelio.tech/download/Unfatten16.dmg"
    strategy :header_match
    regex(/(\d+(?:\.\d+)+)/)
  end

  app "Unfatten.app"
end
