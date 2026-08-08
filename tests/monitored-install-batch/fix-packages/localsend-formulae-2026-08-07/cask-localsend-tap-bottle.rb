FORMULA_PATH=/Users/th-allbrew/homebrew-allbrew/Casks/localsend-tap.rb
cask "localsend-tap" do
  version "1.17.0"
  sha256 "fdf1a42ee13eb9fdd6ae94dc5883981e8a09599e758bde23f6e677c4fab5c93c"

  url "https://github.com/localsend/localsend/releases/download/v1.17.0/LocalSend-1.17.0.dmg"
  name "LocalSend.app"
  desc "Install from https://github.com/localsend/localsend/releases/download/v1.17.0/LocalSend-1.17.0.dmg"

  livecheck do
    url "https://github.com/localsend/localsend/releases/download/v1.17.0/LocalSend-1.17.0.dmg"
    strategy :header_match
    regex(/(\d+(?:\.\d+)+)/)
  end

  app "LocalSend.app"
end