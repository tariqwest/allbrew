cask "ia-writer" do
  version "8.0.5"
  sha256 "6aa35be03d695dbd5cb761089bf63a50e98f4f9a6653fe3e431573197ef69c45"

  url "https://files.ia.net/writer/release/iA-Writer-8.0.5-80037.zip"
  name "iA Writer"
  desc "Install from https://files.ia.net/writer/release/iA-Writer-8.0.5-80037.zip"

  livecheck do
    url "https://files.ia.net/writer/release/iA-Writer-8.0.5-80037.zip"
    strategy :header_match
    regex(/(\d+(?:\.\d+)+)/)
  end

  app "iA Writer.app"
end
