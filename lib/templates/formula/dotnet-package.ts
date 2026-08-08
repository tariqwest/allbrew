import type { DotnetPackagePayload } from "../../template-payload.ts";

export default function renderDotnetPackage(p: DotnetPackagePayload): string {
  const ri = (expr: string) => "#" + "{" + expr + "}";
  return (
    `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
${p.licenseLine}${p.urlLines}
${p.livecheckBlock}${p.allbrewDependency ? `  depends_on "${p.allbrewDependency}"\n` : ""}  depends_on "dotnet"

  def install
    # NuGet local sources require <id>.<version>.nupkg naming.
    nupkg_dir = buildpath/"nupkg"
    nupkg_dir.mkpath
    package_id = ${p.packageName}
    nupkg = nupkg_dir/"${ri("package_id")}.${ri("version")}.nupkg"
    cp cached_download, nupkg

    # Install into libexec so the apphost and .store/ stay co-located.
    # Using bin + env_script_all_files moves only the shim and leaves .store in
    # bin, which breaks the apphost with "application to execute does not exist".
    system "dotnet", "tool", "install", package_id,
           "--tool-path", libexec,
           "--version", version.to_s,
           "--add-source", nupkg_dir

    (bin/"${p.testBinName}").write_env_script libexec/"${p.testBinName}",
                                              DOTNET_ROOT: Formula["dotnet"].opt_libexec
  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("${ri("bin")}/${p.testBinName} --version")
  end
end
`
  );
}
