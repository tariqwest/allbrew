cask "sanebar" do
  version "2.1.89"
  sha256 "1fdd3bc8a96da9ad7abbbdbda69f10da9979762910abaed0a1fdb66fef90fa3f"

  url "https://github.com/sane-apps/SaneBar/releases/download/v2.1.89/SaneBar-2.1.89.zip"
  name "Updater"
  desc "Install from https://github.com/sane-apps/SaneBar/releases/download/v2.1.89/SaneBar-2.1.89.zip"

  livecheck do
    url "https://github.com/sane-apps/SaneBar/releases/download/v2.1.89/SaneBar-2.1.89.zip"
    strategy :header_match
    regex(/(\d+(?:\.\d+)+)/)
  end

  app "Updater.app"
end
