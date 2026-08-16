FORMULA_PATH=/Users/th-allbrew/homebrew-allbrew/Formula/kiliankoe-swift-outdated.rb
class KiliankoeSwiftOutdated < Formula
  desc "A swift subcommand for displaying when your dependencies (SwiftPM or Xcode) are out of date"
  homepage "https://github.com/kiliankoe/swift-outdated"
  license "MIT"
  version "0.15.3"

  on_macos do
    on_arm do
      url "https://github.com/kiliankoe/swift-outdated/releases/download/#{version}/swift-outdated-#{version}-macos.zip"
      sha256 "3b3aa31e1742897cee9723f204d4a1276213c4104b1447df71822bb7e08a7f21"
    end
    on_intel do
      url "https://github.com/kiliankoe/swift-outdated/releases/download/#{version}/swift-outdated-#{version}-macos.zip"
      sha256 "3b3aa31e1742897cee9723f204d4a1276213c4104b1447df71822bb7e08a7f21"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/kiliankoe/swift-outdated/releases/download/#{version}/swift-outdated-#{version}-linux.zip"
      sha256 "cf370334e9c63d2fac918017b3a9e7d25998bc57e888bc9a65cb9d3e7c1dd41a"
    end
  end

  livecheck do
    url :stable
    strategy :github_latest
  end

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"swift-outdated-#{version}-macos/swift-outdated" => "swift-outdated"
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
    assert_match version.to_s, shell_output("#{bin}/swift-outdated --version")
  end
end