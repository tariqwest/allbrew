FORMULA_PATH=/Users/th-allbrew/homebrew-allbrew/Casks/alexballas-go2tv.rb
cask "alexballas-go2tv" do
  version "2.5.0"
  sha256 "13772ffefefd5d12a9da01e1ea1f71c534128e3249c083ab0513f46e0bae504d"

  url "https://github.com/alexballas/go2tv/releases/download/v#{version}/go2tv_v#{version}_macOS_arm64.zip"
  name "go2tv"
  desc "Cast media files to Smart TVs and Chromecast devices."
  homepage "https://github.com/alexballas/go2tv"

  app "go2tv.app"

  livecheck do
    url :head
    strategy :github_latest
  end

  zap trash: [
    "~/Library/Application Support/go2tv",
    "~/Library/Caches/go2tv",
    "~/Library/Preferences/go2tv.plist",
  ]
end