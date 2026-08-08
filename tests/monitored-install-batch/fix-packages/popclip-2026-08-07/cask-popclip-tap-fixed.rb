cask "popclip-tap" do
  version "2026.7.1"
  sha256 "e1349705783831bf5d3d02458932649f85089d1f275d947fdf0f5821306d7246"

  url "https://pilotmoon.com/downloads/PopClip-2026.7.1.zip"
  name "PopClip.app"
  desc "Install from https://pilotmoon.com/downloads/PopClip-2026.7.1.zip"

  livecheck do
    url "https://pilotmoon.com/downloads/PopClip-2026.7.1.zip"
    strategy :header_match
    regex(/(\d+(?:\.\d+)+)/)
  end

  app "PopClip.app"
end
