FORMULA_PATH=/Users/th-allbrew/homebrew-allbrew/Formula/nicotine-plus-nicotine-plus.rb
class NicotinePlusNicotinePlus < Formula
  desc "Graphical client for the Soulseek peer-to-peer network"
  homepage "https://nicotine-plus.org"
  license "GPL-3.0-only"
  version "3.3.10"

  on_macos do
    on_arm do
      url "https://github.com/nicotine-plus/nicotine-plus/releases/download/#{version}/macos-arm64-installer.zip"
      sha256 "ae752794c8b8683ed47ce3c45e1cd55730179c04ca214dfe625a404f5af37b45"
    end
    on_intel do
      url "https://github.com/nicotine-plus/nicotine-plus/releases/download/#{version}/macos-x86_64-installer.zip"
      sha256 "4468a768417544ea64c2f68473162730e4758c70854beccec4a716cf34ed7de1"
    end
  end

  livecheck do
    url :stable
    strategy :github_latest
  end

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"nicotine+-3.3.10.dmg" => "nicotine-plus"
    bin.install_symlink libexec/"nicotine+-3.3.10.dmg" => "nicotine+-3.3.10.dmg"
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
    assert_match version.to_s, shell_output("#{bin}/nicotine-plus --version")
  end
end