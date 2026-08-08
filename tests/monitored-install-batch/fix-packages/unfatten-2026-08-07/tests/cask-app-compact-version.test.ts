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
});
