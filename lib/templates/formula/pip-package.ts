import type { PipPackagePayload } from "../../template-payload.ts";

export default function renderPipPackage(p: PipPackagePayload): string {
  const wrapGuiCliCall = p.wrapGuiCliCall || "";
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
    # Resources installed first can leave the primary console_script out of the
    # pip_install_and_link delta (mlflow class). Force-link the formula bin if
    # present under libexec/bin but missing from bin.
    formula_bin = libexec/"bin"/"${p.testBinName}"
    bin.install_symlink formula_bin if formula_bin.exist? && !(bin/"${p.testBinName}").exist?
    rewrite_delocate_dylib_ids
${wrapGuiCliCall}  end

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

    # Use ruby-macho (same stack as keg_relocate). install_name_tool is often
    # blocked or flaky inside the formula install sandbox; pure-Ruby rewrite is not.
    require "macho"

    rewritten = 0
    scanned = 0
    dlc = 0
    # Pathname#find descends into dotdirs; Dir.glob("**/*") does not, and
    # delocate/opencv wheels put bundled libs under site-packages/*/.dylibs/.
    libexec.find do |path|
      next unless path.extname == ".dylib" && path.file?

      scanned += 1
      begin
        file = MachO.open(path.to_s)
      rescue MachO::NotAMachOError, MachO::MachOError
        next
      end

      id = file.dylib_id
      next if id.nil? || !id.start_with?("/DLC/")

      dlc += 1
      new_id = "@rpath/#{File.basename(id)}"
      next if new_id == id

      begin
        path.chmod(path.stat.mode | 0200)
        file.change_dylib_id(new_id)
        file.write!
        rewritten += 1
      rescue => e
        opoo "delocate dylib rewrite failed for #{path}: #{e}"
      end
    end
    ohai "Rewrote #{rewritten}/#{dlc} delocate /DLC/ dylib IDs to @rpath (scanned #{scanned})" if scanned > 0
    return if dlc.zero? || rewritten.positive?

    odie "Failed to rewrite any of #{dlc} /DLC/ dylib IDs (Homebrew linkage would fail)"
  end

  # GUI console_scripts that ignore --version/--help and start Qt (caliscope class).
  # Replace the linked bin with a wrapper so brew test / batch verify stay headless.
  def wrap_gui_cli_bin(name, dist_name)
    real = libexec/"bin"/name
    return unless real.exist?

    target = bin/name
    target.unlink if target.exist? || target.symlink?
    target.write <<~EOS
      #!/bin/bash
      set -euo pipefail
      REAL="#{real}"
      PY="#{libexec}/bin/python"
      case "\${1:-}" in
        --version|-V)
          exec "$PY" -c "from importlib.metadata import version; print(version('#{dist_name}'))"
          ;;
        --help|-h)
          cat <<'HELP'
      usage: #{name} [--workspace PATH]
      Launch the #{name} GUI (requires a display).
      HELP
          ;;
        *)
          exec "$REAL" "$@"
          ;;
      esac
    EOS
    target.chmod 0755
  end

${p.serviceBlock}  test do
${p.testDoBody}
  end
end
`;
}
