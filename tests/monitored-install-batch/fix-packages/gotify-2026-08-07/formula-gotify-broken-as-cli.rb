class Cli < Formula
  desc "A command line interface for pushing messages to gotify/server."
  homepage "https://github.com/gotify/cli"
  license "MIT"
  version "2.4.0"

  on_macos do
    on_arm do
      url "https://github.com/gotify/cli/releases/download/v#{version}/gotify-cli-darwin-arm64"
      sha256 "0c617505ee7c47962525439263fb40c5ed5c81d0541521a293484bf0690fecc9"
    end
    on_intel do
      url "https://github.com/gotify/cli/releases/download/v#{version}/gotify-cli-darwin-amd64"
      sha256 "677ad4524a0109c9cf5b62a0e24bfa79895c6461e33e009dea5b155132aebd74"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/gotify/cli/releases/download/v#{version}/gotify-cli-linux-arm64"
      sha256 "46353135090c1116f3609e8e4ae99b3b3127f98bf9441566a7aff7eb79343f17"
    end
    on_intel do
      url "https://github.com/gotify/cli/releases/download/v#{version}/gotify-cli-linux-amd64"
      sha256 "251b8d72eddf11317a63ceefd98f655065c62a5ac9a632c5d09709bd747d02af"
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
    bin.install bin_path => "gotify"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/gotify --version")
  end
end
