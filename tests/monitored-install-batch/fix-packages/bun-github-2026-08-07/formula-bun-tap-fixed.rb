class BunTap < Formula
  desc "Incredibly fast JavaScript runtime, bundler, test runner, and package manager – all in one"
  homepage "https://bun.com"
  license "NOASSERTION"
  version "1.3.14"

  on_macos do
    on_arm do
      url "https://github.com/oven-sh/bun/releases/download/bun-v#{version}/bun-darwin-aarch64.zip"
      sha256 "d8b96221828ad6f97ac7ac0ab7e95872341af763001e8803e8267652c2652620"
    end
    on_intel do
      url "https://github.com/oven-sh/bun/releases/download/bun-v#{version}/bun-darwin-x64.zip"
      sha256 "4183df3374623e5bab315c547cfa0974533cd457d86b73b639f7a87974cd6633"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/oven-sh/bun/releases/download/bun-v#{version}/bun-linux-aarch64.zip"
      sha256 "a27ffb63a8310375836e0d6f668ae17fa8d8d18b88c37c821c65331973a19a3b"
    end
    on_intel do
      url "https://github.com/oven-sh/bun/releases/download/bun-v#{version}/bun-linux-x64.zip"
      sha256 "951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f"
    end
  end

  livecheck do
    url :stable
    strategy :github_latest
  end

  def install
    libexec.install Dir["*"]
    exe = Dir[libexec/"**/bun"].find { |f| File.file?(f) && File.executable?(f) }
    exe ||= Dir[libexec/"**/bun"].find { |f| File.file?(f) }
    odie "No bun binary found in archive" unless exe
    bin.install_symlink exe => "bun"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/bun --version")
  end
end
