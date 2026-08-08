class SwiftplantumlTap < Formula
  desc "A command-line tool and Swift Package for generating class diagrams powered by PlantUML"
  homepage "https://marcoeidinger.github.io/SwiftPlantUML/"
  license "MIT"
  url "https://api.github.com/repos/MarcoEidinger/SwiftPlantUML/tarball/0.8.1"
  sha256 "2d70f0aa787c70a4c4d017e5875aeff7adb39e9f86fd01ea8ea2447b47447ea1"
  head "https://github.com/MarcoEidinger/SwiftPlantUML.git", branch: "main"

  livecheck do
    url :head
    strategy :github_latest
  end

  def install
    system "make", "PREFIX=#{prefix}", "install"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/swiftplantuml --version")
  end
end
