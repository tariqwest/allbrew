class MissionControlPlus < Formula
  desc "Install MissionControlPlusReleases"
  homepage "https://github.com/ronyfadel/MissionControlPlusReleases"
  url "https://api.github.com/repos/ronyfadel/MissionControlPlusReleases/tarball/v1.24"
  sha256 "c62e7fbcf50bf333842b1da4e8beb8c1001a1dc50a00f59fbd22dc9c5e2633a2"
  head "https://github.com/ronyfadel/MissionControlPlusReleases.git", branch: "master"

  livecheck do
    url :head
    strategy :github_latest
  end

  def install
    system "make", "PREFIX=#{prefix}", "install"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/mission-control-plus --version")
  end
end
