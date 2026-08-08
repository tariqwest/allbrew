describe("client/latest native installer probes (Zoom-class vendors)", () => {
  it("invents Zoom.pkg and zoomusInstallerFull.pkg under /client/latest", () => {
    const fromUs = inventClientLatestArtifactUrls("https://zoom.us/");
    const fromCom = inventClientLatestArtifactUrls("https://www.zoom.com/");
    expect(fromUs.some((u) => u.includes("zoom.us") && u.endsWith("/client/latest/Zoom.pkg"))).toBe(true);
    expect(fromCom.some((u) => u.includes("zoom.us") && u.endsWith("/client/latest/Zoom.pkg"))).toBe(true);
    expect(fromUs.some((u) => /zoomusInstallerFull\.pkg$/i.test(u))).toBe(true);
  });

  it("prefers native pkg over mac-app-store when both present", () => {
    const page = "https://www.zoom.com/";
    const list = preferNativeInstallersOverStore([
      scoreCandidateUrl("https://itunes.apple.com/us/app/id546505307", page, ["webview"]),
      scoreCandidateUrl("https://zoom.us/client/latest/Zoom.pkg", page, ["client-latest-guess"]),
    ]);
    expect(list[0].kind).toBe("cask-dmg");
    expect(list[0].url).toContain("Zoom.pkg");
    expect(list.find((c) => c.kind === "mac-app-store")?.evidence).toContain(
      "store-vs-native-penalty",
    );
  });

  it("enrichClientLatestArtifacts promotes HEAD-ok /client/latest pkg over MAS", async () => {
    const page = "https://zoom.us/";
    const mas = scoreCandidateUrl(
      "https://itunes.apple.com/us/app/id546505307",
      page,
      ["webview"],
    );
    const result = await enrichClientLatestArtifacts([mas], page, {
      headOk: async (url) => /\/client\/latest\/Zoom\.pkg$/i.test(url),
    });
    const chosen = pickAutoCandidate(preferNativeInstallersOverStore(result));
    expect(chosen?.kind).toBe("cask-dmg");
    expect(chosen?.url).toMatch(/Zoom\.pkg$/);
  });
});
