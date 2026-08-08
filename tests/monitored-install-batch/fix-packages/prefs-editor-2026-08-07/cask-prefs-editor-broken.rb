FORMULA_PATH=/Users/th-allbrew/homebrew-allbrew/Casks/prefs-editor-tap.rb
cask "prefs-editor-tap" do
  version "1.4.2"
  sha256 "72b99db5da69f1a35a727dbcf7b82afdc482b40ba1b5b612b8e91f8512b23c2d"

  url "https://files.tempel.org/Various/OSX_Prefs_Editor/PrefsEditor-1.4.2.zip"
  name "Autoupdate.app"
  desc "Install from https://files.tempel.org/Various/OSX_Prefs_Editor/PrefsEditor-1.4.2.zip"

  livecheck do
    url "https://files.tempel.org/Various/OSX_Prefs_Editor/PrefsEditor-1.4.2.zip"
    strategy :header_match
    regex(/(\d+(?:\.\d+)+)/)
  end

  app "Autoupdate.app"
end