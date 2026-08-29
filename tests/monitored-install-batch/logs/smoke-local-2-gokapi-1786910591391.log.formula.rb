FORMULA_PATH=/Users/th-allbrew/homebrew-allbrew/Formula/gokapi.rb
class Gokapi < Formula
  desc "Lightweight selfhosted Firefox Send alternative without public upload. AWS S3 supported."
  homepage "https://github.com/Forceu/Gokapi"
  license "AGPL-3.0"
  version "2.2.4"

  on_macos do
    on_arm do
      url "https://github.com/Forceu/Gokapi/releases/download/v#{version}/gokapi-#{version}_darwin-arm64.zip"
      sha256 "d6d6fe3f94338b1323e3eb67fa47a78bdf52018fa0aaba6ed0403f1d5e9d18c4"
    end
    on_intel do
      url "https://github.com/Forceu/Gokapi/releases/download/v#{version}/gokapi-#{version}_darwin-amd64.zip"
      sha256 "bcdf00dbe2f18b37341c659a8be3622529c8f88b43781e233d1fa4366647d76b"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/Forceu/Gokapi/releases/download/v#{version}/gokapi-#{version}_linux-arm64.zip"
      sha256 "9f82cfb96fc48ac9bdfb94584dc6ba4648de1ac4fcd1276d2dd5a7e0f80398f7"
    end
    on_intel do
      url "https://github.com/Forceu/Gokapi/releases/download/v#{version}/gokapi-#{version}_linux-386.zip"
      sha256 "27c03e3aa30d6c146c6675c0b23da7c63571cb08468840790c9a6e0f0ddc0969"
    end
  end

  livecheck do
    url :stable
    strategy :github_latest
  end

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"gokapi" => "gokapi"
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
    assert_match version.to_s, shell_output("#{bin}/gokapi --version")
  end
end