FORMULA_PATH=/Users/th-allbrew/homebrew-allbrew/Formula/gotify-cli.rb
class GotifyCli < Formula
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
      url "https://github.com/gotify/cli/releases/download/v#{version}/gotify-cli-linux-386"
      sha256 "ad89d13e9f1f41e4ca2029f963414cbd5a8109e6acad694324c4d973fc5b6680"
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
    bin.install bin_path => "cli"
    return unless OS.mac?

    search_dirs = [libexec, bin].select { |d| d.respond_to?(:directory?) ? d.directory? : Dir.exist?(d.to_s) }.map(&:to_s)
    return if search_dirs.empty?

    mach_o = Utils.safe_popen_read(
      "/usr/bin/find", *search_dirs, "-type", "f", "-perm", "+111", "-print0"
    ).split("\0").reject(&:empty?).select do |path|
      Utils.safe_popen_read("/usr/bin/file", "-b", path).include?("Mach-O")
    rescue
      false
    end

    mach_o.each do |path|
      system "/usr/bin/xattr", "-cr", path
      system "/usr/bin/codesign", "--force", "--sign", "-", path
    end
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/cli --version")
  end
end