cask "tokenbar" do
  version "0.37.6"
  sha256 "bd546729da88124813d76a931b3ecd1315d44fb396edeb20230a6f6dc0f06976"

  url "https://www.tokenbar.site/api/download/latest"
  name "TokenBar"
  desc "Install from https://www.tokenbar.site/api/download/latest"

  livecheck do
    url "https://www.tokenbar.site/api/download/latest"
    strategy :header_match
    regex(/(\d+(?:\.\d+)+)/)
  end

  app "TokenBar.app"
end
