cask "qoder" do
  version "6.4"
  sha256 "3c76af24295e2c3e60297c5dbba0fab7d7263f176d3bd1e6ecd4736a3d56bb69"

  url "https://download.qoder.com/release/latest/Qoder-darwin-arm64.dmg"
  name "Qoder"
  desc "Install from https://download.qoder.com/release/latest/Qoder-darwin-arm64.dmg"

  livecheck do
    url "https://download.qoder.com/release/latest/Qoder-darwin-arm64.dmg"
    strategy :header_match
    regex(/(\d+(?:\.\d+)+)/)
  end

  app "Qoder.app"
end
