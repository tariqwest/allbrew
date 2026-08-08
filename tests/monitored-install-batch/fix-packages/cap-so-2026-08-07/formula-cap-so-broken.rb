class CapSo < Formula
  desc "Open source Loom alternative. Beautiful, shareable screen recordings."
  homepage "https://cap.so"
  license "NOASSERTION"
  url "https://api.github.com/repos/CapSoftware/Cap/tarball/cap-v0.5.7"
  sha256 "bcbef99a3d2946b5a2bb5d4de59c9b7e36a1aa6196b6aeead5704b6c0d191e23"
  head "https://github.com/CapSoftware/Cap.git", branch: "main"

  livecheck do
    url "https://crates.io/api/v1/crates/Cap"
    regex(/"(?:max_stable_version|newest_version)"\s*:\s*"v?([^"\\]+)"/i)
  end

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/cap-so --version")
  end
end
