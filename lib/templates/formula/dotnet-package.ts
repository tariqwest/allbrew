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
    package_id = ${p.packageId}
    nupkg = nupkg_dir/"${ri("package_id")}.${ri("version")}.nupkg"
    cp cached_download, nupkg

    # Install into libexec so the apphost and .store/ stay co-located.
    # Using bin + env_script_all_files moves only the shim and leaves .store in
    # bin, which breaks the apphost with "application to execute does not exist".
    system "dotnet", "tool", "install", package_id,
           "--tool-path", libexec,
           "--version", version.to_s,
           "--add-source", nupkg_dir

    tool_bin = libexec/${p.toolCommand}
    target_bin = bin/"${p.testBinName}"
    if tool_bin.exist?
      target_bin.write_env_script tool_bin,
                                 DOTNET_ROOT: Formula["dotnet"].opt_libexec,
                                 DOTNET_ROLL_FORWARD: "${p.rollForward}"
    else
      installed = Dir[libexec/"*"].find { |f| File.executable?(f) && !File.directory?(f) }
      if installed
        target_bin.write_env_script installed,
                                   DOTNET_ROOT: Formula["dotnet"].opt_libexec,
                                   DOTNET_ROLL_FORWARD: "${p.rollForward}"
      else
        (bin/"${p.testBinName}").write_env_script libexec/${p.toolCommand},
                                                  DOTNET_ROOT: Formula["dotnet"].opt_libexec,
                                                  DOTNET_ROLL_FORWARD: "${p.rollForward}"
      end
    end
  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("${ri("bin")}/${p.testBinName} --version")
  end
end
`
  );
}
