import type { PipPackagePayload } from "../../template-payload.ts";

export default function renderPipPackage(p: PipPackagePayload): string {
  return `class ${p.className} < Formula
  include Language::Python::Virtualenv

  desc "${p.desc}"
  homepage "${p.homepage}"
  url "${p.url}"
  sha256 "${p.sha256}"
${p.licenseLine}
${p.livecheckBlock}${p.allbrewDependency ? `  depends_on "${p.allbrewDependency}"\n` : ""}  depends_on "python@3.13"

  # Native wheels (jiter, pydantic-core, delocate-bundled av/opencv, …) ship
  # dylib IDs like @rpath/foo.so or short /DLC/pkg/.dylibs/foo.dylib.
  # Homebrew's fix_dynamic_linkage expands those to long Cellar/opt paths that
  # do not fit the Mach-O header. Preserve @rpath IDs; rewrite /DLC/ below.
  preserve_rpath

${p.resourcesBlock}  def install
    venv = virtualenv_create(libexec, "python3.13")
    # Homebrew python@3.13 venvs may inherit system site-packages. Isolate so
    # formula resources cannot resolve against /opt/homebrew/lib/python*.
    pyvenv_cfg = libexec/"pyvenv.cfg"
    if pyvenv_cfg.exist?
      lines = pyvenv_cfg.read.lines
      replaced = false
      lines.map! do |line|
        if line.start_with?("include-system-site-packages")
          replaced = true
          "include-system-site-packages = false\\n"
        else
          line
        end
      end
      lines << "include-system-site-packages = false\\n" unless replaced
      pyvenv_cfg.atomic_write(lines.join)
    end
    resources.each { |r| pip_install_dist(venv, r) }
    pip_install_main(venv)
    rewrite_delocate_dylib_ids
  end

  def pip_install_dist(venv, dist)
    url = dist.url.to_s
    if url.include?(".whl")
      dist.fetch unless dist.downloaded?
      path = URI(url).path.to_s
      basename = File.basename(path.empty? ? url : path)
      whl = buildpath/basename
      rm_f whl
      ln_sf dist.cached_download, whl
      venv.pip_install whl
    else
      venv.pip_install dist
    end
  end

  def pip_install_main(venv)
    url = stable.url.to_s
    if url.include?(".whl")
      path = URI(url).path.to_s
      basename = File.basename(path.empty? ? url : path)
      whl = buildpath/basename
      rm_f whl
      ln_sf cached_download, whl
      venv.pip_install_and_link whl
    else
      venv.pip_install_and_link buildpath
    end
  end

  # delocate (and auditwheel-style macOS bundlers) stamp dylib IDs with a short
  # absolute prefix /DLC/pkg/.dylibs/libfoo.dylib so load commands fit. After
  # pip install, Homebrew tries to rewrite those IDs to
  # $HOMEBREW_PREFIX/opt/<formula>/libexec/.../libfoo.dylib which overflows the
  # Mach-O header ("Failed changing dylib ID"). Convert /DLC/ IDs to
  # @rpath/<basename> so preserve_rpath keeps them and linkage still resolves
  # via the wheel's existing @loader_path references.
  def rewrite_delocate_dylib_ids
    return unless OS.mac?

    rewritten = 0
    # Use find(1): Ruby Dir.glob("**/*") does NOT descend into dotdirs, and
    # delocate/opencv wheels put bundled libs under site-packages/*/.dylibs/.
    dylibs = Utils.safe_popen_read(
      "find", libexec.to_s, "-type", "f", "-name", "*.dylib"
    ).split("\\n").map(&:strip).reject(&:empty?)

    dylibs.each do |dylib|
      next unless File.file?(dylib)

      # otool -D prints: path\\ninstall_name
      lines = Utils.popen_read("/usr/bin/otool", "-D", dylib).lines.map(&:strip).reject(&:empty?)
      id = lines.find { |l| l.start_with?("/DLC/") } || lines[1]
      next if id.nil? || id.empty?
      next unless id.start_with?("/DLC/")

      new_id = "@rpath/#{File.basename(id)}"
      next if new_id == id

      # pip may hardlink from the cache as mode 0444; install_name_tool needs write.
      File.chmod(File.stat(dylib).mode | 0200, dylib)
      # Best-effort strip; quiet_system ignores non-zero (unsigned binaries).
      quiet_system "/usr/bin/codesign", "--remove-signature", dylib
      odie "install_name_tool -id failed for #{dylib}" unless system "/usr/bin/install_name_tool", "-id", new_id, dylib
      odie "codesign failed for #{dylib}" unless system "/usr/bin/codesign", "--force", "--sign", "-", dylib
      rewritten += 1
    end
    ohai "Rewrote #{rewritten} delocate /DLC/ dylib IDs to @rpath (scanned #{dylibs.size})" if rewritten > 0 || dylibs.any?
  end

${p.serviceBlock}  test do
${p.testDoBody}
  end
end
`;
}
