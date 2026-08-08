FORMULA_PATH=/Users/th-allbrew/homebrew-allbrew/Formula/oh-my-zsh.rb
class OhMyZsh < Formula
  desc "🙃   A delightful community-driven (with 2,500+ contributors) framework for managing your zsh configuration. Includes 300+ optional plugins (rails, git, macOS, hub, docker, homebrew, node, php, python, etc), 140+ themes to spice up your morning, and an auto-update tool that makes it easy to keep up with the latest updates from the community."
  homepage "https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh"
  url "https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh"
  version "0.0.1"
  sha256 "95118b50d062198597e2b73d3a57b609fd95ca68cdc86faf4460d955f0172b61"

  livecheck do
    url "https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh"
    strategy :header_match
    regex(/(\d+(?:\.\d+)+)/)
  end

  def install
    ENV["PREFIX"] = prefix.to_s
    ENV["DESTDIR"] = prefix.to_s
    ENV["HOME"] = buildpath.to_s
    system "bash", cached_download.to_s
    bin.install Dir[buildpath/"bin/*"] if (buildpath/"bin").exist?
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/oh-my-zsh --version")
  end
end