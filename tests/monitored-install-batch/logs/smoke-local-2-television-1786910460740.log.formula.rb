FORMULA_PATH=/Users/th-allbrew/homebrew-allbrew/Formula/alexpasmantier-television.rb
class AlexpasmantierTelevision < Formula
  desc "A very fast, portable and hackable fuzzy finder."
  homepage "https://alexpasmantier.github.io/television/"
  license "MIT"
  version "0.15.9"

  on_macos do
    on_arm do
      url "https://github.com/alexpasmantier/television/releases/download/#{version}/tv-#{version}-aarch64-apple-darwin.tar.gz"
      sha256 "94ae7177d499f74e7544243ffe9c82371183ca11a6363f198a4b3d0e29f82732"
    end
    on_intel do
      url "https://github.com/alexpasmantier/television/releases/download/#{version}/tv-#{version}-x86_64-apple-darwin.tar.gz"
      sha256 "0c6029ced92ddcf8218a8ce9a9d605d232898e2df021ae212d38c66f6c3abaad"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/alexpasmantier/television/releases/download/#{version}/tv-#{version}-aarch64-unknown-linux-gnu.tar.gz"
      sha256 "78a246170c9d83bea0f0c4a3fa8c9bc5cee80bbe66d34946d06fdc5a17a2cd1a"
    end
    on_intel do
      url "https://github.com/alexpasmantier/television/releases/download/#{version}/tv-#{version}-i686-unknown-linux-gnu.tar.gz"
      sha256 "4ccb790c451a4034c5b71b7d377a0f1b36ba01b0a0194b27832980e2cac209f7"
    end
  end

  livecheck do
    url :stable
    strategy :github_latest
  end

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"tv-#{version}-aarch64-apple-darwin/tv" => "television"
    bin.install_symlink libexec/"tv-#{version}-aarch64-apple-darwin/tv" => "tv"
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
    assert_match version.to_s, shell_output("#{bin}/television --version")
  end
end