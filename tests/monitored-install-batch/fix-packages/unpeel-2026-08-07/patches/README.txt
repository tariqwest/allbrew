# unpeel page-discover deltas (apply conceptually onto current main page-discover.ts)
# 1) isDownloadHubPath: treat /download/mac|latest as artifacts not HTML hubs
# 2) enrichExtensionlessArtifactUrls: invent /download/mac|macos|osx|darwin guesses; maxProbes 10
# 3) discoverFromScriptBundles: match quoted /download/mac paths
