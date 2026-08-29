FORMULA_PATH=/Users/th-allbrew/homebrew-allbrew/Formula/krokiet.rb
class Krokiet < Formula
  desc "Multi functional app to find duplicates, empty folders, similar images etc."
  homepage "https://github.com/qarmin/czkawka"
  license "NOASSERTION"
  version "12.0.1"

  on_macos do
    on_arm do
      url "https://github.com/qarmin/czkawka/releases/download/#{version}/mac_krokiet_arm64"
      sha256 "77e7420ce04f6e6aa01f9c509f800d8921beb361128ccfcbe9def3aa401fbf9b"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/qarmin/czkawka/releases/download/#{version}/linux_krokiet_arm64"
      sha256 "170b252fb007a2a18d16b0162c8c118f192e111f959585bea4f683ceddb6d3df"
    end
    on_intel do
      url "https://github.com/qarmin/czkawka/releases/download/#{version}/linux_krokiet_x86_64"
      sha256 "7108b088afdf27e21356962f344ccaf51306723fd7e10b96d952826e7f271603"
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
    bin.install bin_path => "krokiet"
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
    assert_match version.to_s, shell_output("#{bin}/krokiet --version")
  end
end