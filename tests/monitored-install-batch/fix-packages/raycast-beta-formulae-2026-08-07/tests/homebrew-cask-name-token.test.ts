import { describe, expect, test } from "bun:test";
import { classify } from "../../lib/classifier.ts";
import { generateHomebrewCask } from "../../lib/generators/homebrew-cask.ts";
import { mkdirSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("homebrew-cask official token", () => {
  test("classifies formulae.brew.sh/cask/raycast as homebrew-cask named raycast", () => {
    const r = classify("https://formulae.brew.sh/cask/raycast");
    expect(r.type).toBe("homebrew-cask");
    expect(r.name).toBe("raycast");
  });

  test("generateHomebrewCask uses API token raycast not a catalog slug", async () => {
    const tap = mkdtempSync(join(tmpdir(), "allbrew-hcask-"));
    mkdirSync(join(tap, "Casks"), { recursive: true });
    const result = await generateHomebrewCask("raycast", { tapPath: tap });
    expect(result.name).toBe("raycast");
    expect(existsSync(join(tap, "Casks", "raycast.rb"))).toBe(true);
    const body = readFileSync(join(tap, "Casks", "raycast.rb"), "utf8");
    expect(body).toContain('cask "raycast"');
    expect(body).toContain("Raycast.app");
  });
});
