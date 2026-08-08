cask "cap-so" do
  version "0.5.8"
  sha256 "74afd36c9541e57eaeb155adfe7dfbeda11ea72b0bd9fcc5a3d8641217bb4c57"

  url "https://cdn.crabnebula.app/asset/01KZ8Q4FEW4JAGFQ3NQPR5XTX3?from=%7B%22orgSlug%22%3A%22cap%22%2C%22appSlug%22%3A%22cap%22%2C%22publicPlatform%22%3A%22dmg-aarch64%22%7D"
  name "Cap"
  desc "Open source Loom alternative. Beautiful, shareable screen recordings."
  homepage "https://cap.so"

  livecheck do
    url "https://cap.so/download/apple-silicon"
    strategy :header_match
    regex(/(\d+(?:\.\d+)+)/)
  end

  app "Cap.app"
end
