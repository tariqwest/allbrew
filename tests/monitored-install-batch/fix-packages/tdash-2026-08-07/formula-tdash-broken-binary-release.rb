class Tdash < Formula
  desc "A terminal dashboard with stats from Google Analytics, GitHub, Travis CI, and Jenkins. Very much built specific to me."
  homepage "https://github.com/jessfraz/tdash"
  license "MIT"
  version "0.5.5"

  on_macos do
    on_intel do
      url "https://github.com/jessfraz/tdash/releases/download/v#{version}/tdash-darwin-amd64"
      sha256 "11354381aa5e8d86ec7e11c79dd0c74e0b39546c279e59d20be855a95a474473"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/jessfraz/tdash/releases/download/v#{version}/tdash-linux-arm64"
      sha256 "522dfaf8cb9c931f66628ad02ea4a7435f83101856c581727693924603ba537e"
    end
    on_intel do
      url "https://github.com/jessfraz/tdash/releases/download/v#{version}/tdash-linux-amd64"
      sha256 "70808466216dde7147e693c8dacfbafde6b4d6c7c8baf27a4e00d684360cb105"
    end
  end

  livecheck do
    url :stable
    strategy :github_latest
  end

  def install
    bin_path = Dir["*"].find { |f| File.file?(f) && File.executable?(f) }
    bin_path ||= Dir["*"].find { |f| File.file?(f) && !f.end_with?(".txt", ".sha256", ".sig", ".asc") }
    odie "No binary found in download" unless bin_path
    bin.install bin_path => "tdash"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/tdash --version")
  end
end
