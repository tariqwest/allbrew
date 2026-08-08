import { describe, it, expect } from "bun:test";
import {
  extractCompactVersion,
  extractVersionFromUrl,
} from "../../lib/generators/cask-app.ts";

describe("cask-app version extraction", () => {
  it("maps compact Unfatten16.dmg to 1.6", () => {
    expect(extractCompactVersion("Unfatten16.dmg")).toBe("1.6");
    expect(extractCompactVersion("Unfatten15.zip")).toBe("1.5");
  });
  it("returns null without trailing two digits", () => {
    expect(extractCompactVersion("Unfatten.dmg")).toBeNull();
  });
  it("extractVersionFromUrl keeps dotted versions", () => {
    expect(extractVersionFromUrl("https://x.com/App-1.2.3.dmg")).toBe("1.2.3");
  });

  it("parses underscore-dotted version before arch suffix", () => {
    expect(
      extractVersionFromUrl(
        "https://mac.monk-mode.lifestyle/downloads/MonkMode_0.1.0_aarch64.dmg",
      ),
    ).toBe("0.1.0");
  });
  it("does not treat aarch64 as compact 6.4", () => {
    expect(extractCompactVersion("MonkMode_0.1.0_aarch64.dmg")).toBeNull();
    expect(extractCompactVersion("App_aarch64.dmg")).toBeNull();
    expect(extractCompactVersion("Tool_x64.dmg")).toBeNull();
  });

});
