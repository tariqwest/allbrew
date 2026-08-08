class SyncthingMenu < Formula
  desc "A frugal, native macOS menu-bar app for Syncthing"
  homepage "https://github.com/gtunes-dev/syncthing-menu"
  license "MIT"
  url "https://api.github.com/repos/gtunes-dev/syncthing-menu/tarball/v0.3.4"
  sha256 "d16952765542311b4ce4ba271c1cfcf2c2d7a74a20131c9e834ad14e5d94eebe"
  head "https://github.com/gtunes-dev/syncthing-menu.git", branch: "main"

  livecheck do
    url :head
    strategy :github_latest
  end

  def install
    system "make", "PREFIX=#{prefix}", "install"
  end

  service do
    run ["menu-bar", "agent", "("]
    keep_alive true
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/syncthing-menu --version")
  end
end
