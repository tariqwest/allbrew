// Snippet to merge into tests/unit/analyzer.test.ts (detectInstallMethod describe)
it("detects `> pip install` shell-prompt docs (visdom-style)", () => {
    const result = detectInstallMethod(
      "```bash\n> pip install visdom\n```",
      "visdom",
    );
    expect(result).toEqual({ method: "pip", package: "visdom" });
  });

  it("prefers preferred PyPI package over optional dep pip install (visdom vs plotly)", () => {
    const readme = `
## Setup

Install from pip

\`\`\`bash
> pip install visdom
\`\`\`

#### vis.plotlyplot

> **Note** You must have the \`plotly\` Python package installed to use this function. It can typically be installed by running \`pip install plotly\`.
`;
    expect(detectInstallMethod(readme, "visdom")).toEqual({
      method: "pip",
      package: "visdom",
    });
    // Without preferred name, first pip install after prompt stripping is visdom.
    expect(detectInstallMethod(readme)).toEqual({
      method: "pip",
      package: "visdom",
    });
  });

  it("does not pick unrelated optional pip dep when preferred name is set and primary is missing", () => {
    const readme =
      "Optional: run `pip install plotly` for Plotly figures.\n";
    // Preferred app is not documented as pip install — do not claim plotly.
    expect(detectInstallMethod(readme, "visdom")).toBeNull();
  });

  