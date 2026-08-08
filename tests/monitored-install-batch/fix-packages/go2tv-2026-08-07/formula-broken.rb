class Go2tv < Formula
  desc "Cast media files to Smart TVs and Chromecast devices."
  homepage "https://github.com/alexballas/go2tv"
  license "MIT"
  version "2.5.0"

  on_macos do
    on_arm do
      url "https://github.com/alexballas/go2tv/releases/download/v#{version}/go2tv_v#{version}_macOS_arm64.zip"
      sha256 "13772ffefefd5d12a9da01e1ea1f71c534128e3249c083ab0513f46e0bae504d"
    end
    on_intel do
      url "https://github.com/alexballas/go2tv/releases/download/v#{version}/go2tv_v#{version}_macOS_amd64.zip"
      sha256 "33586b765f493ea2e6be85917f5e6647da9c549cfb054db7be37ad45702b625f"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/alexballas/go2tv/releases/download/v#{version}/go2tv_v#{version}_linux_arm64.zip"
      sha256 "7f4a6d1b4f4407b3e37d9d574cd8348a67c2f7111958092c7a2a957dece83d3c"
    end
    on_intel do
      url "https://github.com/alexballas/go2tv/releases/download/v#{version}/go2tv_v#{version}_linux_amd64.zip"
      sha256 "b02c22ebc3f4f42e6f2c29bf4793fcf0e06a0f213644768fba9b595b98da53ef"
    end
  end

  livecheck do
    url :stable
    strategy :github_latest
  end

  def install
    libexec.install Dir["*"]
    exe = Dir[libexec/"**/LICENSE"].find { |f| File.file?(f) && File.executable?(f) }
    exe ||= Dir[libexec/"**/LICENSE"].find { |f| File.file?(f) }
    odie "No LICENSE binary found in archive" unless exe
    bin.install_symlink exe => "go2tv"
    bin.install_symlink exe => "LICENSE"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/go2tv --version")
  end
end
