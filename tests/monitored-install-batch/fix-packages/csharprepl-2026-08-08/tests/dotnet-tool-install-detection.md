// Add to tests/unit/analyzer.test.ts detectInstallMethod suite:
  it("detects dotnet tool install -g as nuget global tool", () => {
    const result = detectInstallMethod(
      "```bash\ndotnet tool install -g csharprepl\n```",
    );
    expect(result).toEqual({ method: "dotnet", package: "csharprepl" });
  });
