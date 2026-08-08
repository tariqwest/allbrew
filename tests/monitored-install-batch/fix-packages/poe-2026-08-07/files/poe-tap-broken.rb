FORMULA_PATH=/Users/th-allbrew/homebrew-allbrew/Casks/poe-tap.rb
cask "poe-tap" do
  version "1.1.45"
  sha256 "14260ec8e9c8d1c9a364b05c524724a93fa499488f2b59b4ac04ac73a5683bed"

  url "https://desktop-app.poecdn.net/updates/darwin_arm64/1.1.45.zip"
  name "Poe Helper (Renderer).app"
  desc "Install from https://desktop-app.poecdn.net/updates/darwin_arm64/1.1.45.zip"

  livecheck do
    url "https://desktop-app.poecdn.net/updates/darwin_arm64/1.1.45.zip"
    strategy :header_match
    regex(/(\d+(?:\.\d+)+)/)
  end

  app "Poe Helper (Renderer).app"
end