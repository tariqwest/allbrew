import { describe, it, expect } from "vitest";
import { classify } from "../../lib/classifier.ts";

describe("classify", () => {
  describe("github-repo", () => {
    it("matches standard GitHub repo URL", () => {
      const result = classify("https://github.com/muety/wakapi");
      expect(result).toEqual({
        type: "github-repo",
        url: "https://github.com/muety/wakapi",
        owner: "muety",
        repo: "wakapi",
      });
    });

    it("matches GitHub repo URL with trailing slash", () => {
      const result = classify("https://github.com/F1bonacc1/process-compose/");
      expect(result).toEqual({
        type: "github-repo",
        url: "https://github.com/F1bonacc1/process-compose/",
        owner: "F1bonacc1",
        repo: "process-compose",
      });
    });

    it("strips .git suffix", () => {
      const result = classify("https://github.com/robinovitch61/wander.git");
      expect(result.repo).toBe("wander");
    });

    it("matches GitHub tree/blob URLs as github-repo", () => {
      const result = classify(
        "https://github.com/muety/wakapi/tree/master/src",
      );
      expect(result.type).toBe("github-repo");
      expect(result.owner).toBe("muety");
      expect(result.repo).toBe("wakapi");
    });

    it("normalizes tree URL to repo root", () => {
      const result = classify(
        "https://github.com/muety/wakapi/blob/master/README.md",
      );
      expect(result.url).toBe("https://github.com/muety/wakapi");
    });
  });

  describe("mac-app-store", () => {
    it("matches apps.apple.com URL", () => {
      const result = classify(
        "https://apps.apple.com/us/app/bear/id1091189122?mt=12",
      );
      expect(result.type).toBe("mac-app-store");
    });

    it("matches itunes.apple.com URL", () => {
      const result = classify(
        "https://itunes.apple.com/us/app/xcode/id497799835",
      );
      expect(result.type).toBe("mac-app-store");
    });
  });

  describe("bash-script", () => {
    it("matches .sh extension", () => {
      const result = classify("https://starship.rs/install.sh");
      expect(result.type).toBe("bash-script");
    });

    it("matches .bash extension", () => {
      const result = classify("https://example.com/setup.bash");
      expect(result.type).toBe("bash-script");
    });

    it("matches raw.githubusercontent.com URLs as bash-script", () => {
      const result = classify(
        "https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh",
      );
      expect(result.type).toBe("bash-script");
    });

    it("matches raw.githubusercontent.com without .sh extension as bash-script", () => {
      const result = classify(
        "https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install",
      );
      expect(result.type).toBe("bash-script");
    });
  });

  describe("cask-dmg", () => {
    it("matches .dmg URL", () => {
      const result = classify(
        "https://github.com/webstonehq/seaquel/releases/download/v2026.4.8/Seaquel_2026.4.8_aarch64.dmg",
      );
      expect(result.type).toBe("cask-dmg");
    });

    it("matches developer site .dmg URL", () => {
      const result = classify(
        "https://proxyman.io/release/osx/Proxyman_latest.dmg",
      );
      expect(result.type).toBe("cask-dmg");
    });
  });

  describe("archive", () => {
    it("matches .tar.gz URL", () => {
      const result = classify("https://example.com/foo-1.0.tar.gz");
      expect(result.type).toBe("archive");
    });

    it("matches .zip URL", () => {
      const result = classify(
        "https://ollama.com/download/Ollama-darwin.zip",
      );
      expect(result.type).toBe("archive");
    });

    it("matches .pkg URL", () => {
      const result = classify("https://zoom.us/client/latest/Zoom.pkg");
      expect(result.type).toBe("archive");
    });

    it("matches .tgz URL", () => {
      const result = classify("https://example.com/release.tgz");
      expect(result.type).toBe("archive");
    });

    it("matches raw.githubusercontent.com archive over bash-script", () => {
      const result = classify(
        "https://raw.githubusercontent.com/someone/repo/main/dist/release.tar.gz",
      );
      expect(result.type).toBe("archive");
    });
  });

  describe("unknown", () => {
    it("returns unknown for PyPI URLs", () => {
      const result = classify("https://pypi.org/project/marimo/");
      expect(result.type).toBe("unknown");
    });

    it("returns unknown for npm URLs", () => {
      const result = classify("https://www.npmjs.com/package/maildev");
      expect(result.type).toBe("unknown");
    });

    it("returns unknown for crates.io URLs", () => {
      const result = classify("https://crates.io/crates/managarr");
      expect(result.type).toBe("unknown");
    });

    it("returns unknown for bare domains without extensions", () => {
      const result = classify("https://get.volta.sh");
      expect(result.type).toBe("unknown");
    });
  });
});
