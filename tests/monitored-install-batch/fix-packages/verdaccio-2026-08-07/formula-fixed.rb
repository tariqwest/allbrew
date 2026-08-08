class Verdaccio < Formula
  desc "A lightweight private npm proxy registry"
  homepage "https://verdaccio.org"
  url "https://registry.npmjs.org/verdaccio/-/verdaccio-6.9.2.tgz"
  sha256 "939c660f276950cfdeaced2be0ea76a8a32fd89f8d85841bfdeb12ae0f71ee71"
  license "MIT"

  livecheck do
    url "https://registry.npmjs.org/verdaccio/latest"
    regex(/"version"\s*:\s*"v?([^"\\]+)"/i)
  end

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args, "--min-release-age=0"
    bin.install_symlink libexec.glob("bin/*")

    return unless OS.mac?

    mach_o = Utils.safe_popen_read(
      "/usr/bin/find", libexec.to_s, "-type", "f", "-perm", "+111", "-print0"
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

  service do
    run opt_bin/"verdaccio"
    keep_alive true
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/verdaccio --version")
  end
end
