cask "carbon-copy-cloner-tap" do
  version "1.3"
  sha256 :no_check

  url "macappstore://apps.apple.com/app/id6471621409?mt=12"
  name "CCC Mobile Backup"
  desc "Install from https://apps.apple.com/app/ccc-mobile-backup/id6471621409"
  homepage "https://bombich.com/ccc-mobile-backup"

  livecheck do
    url "https://itunes.apple.com/lookup?id=6471621409"
    regex(/"version"\s*:\s*"([^"]+)"/i)
  end

  depends_on formula: "mas"

  installer script: {
    executable: "mas",
    args: ["install", "6471621409"],
  }

  uninstall delete: "/Applications/CCC Mobile Backup.app"

  zap trash: [
    "~/Library/Application Support/CCC Mobile Backup",
    "~/Library/Caches/com.bombich.cccmobile",
    "~/Library/Preferences/com.bombich.cccmobile.plist",
    "~/Library/Saved Application State/com.bombich.cccmobile.savedState",
  ]
end
