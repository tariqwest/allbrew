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

  # Native wheels (jiter, pydantic-core, …) ship dylib IDs like
  # @rpath/foo.so. Homebrew's fix_dynamic_linkage expands those to long
  # Cellar paths that do not fit the Mach-O header. Preserve @rpath IDs.
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
    # setuptools>=82 removed pkg_resources; older setup.py (e.g. visdom) still
    # import it at module level and fail PEP 517 isolated builds.
    patch_legacy_setup_py_pkg_resources
    pip_install_main(venv)
  end

  def patch_legacy_setup_py_pkg_resources
    setup_py = buildpath/"setup.py"
    return unless setup_py.exist?

    text = setup_py.read
    return unless text.include?("pkg_resources")

    shim = <<~'PY'
      try:
          from pkg_resources import get_distribution, DistributionNotFound
      except ImportError:
          try:
              from importlib.metadata import distribution as _imd_distribution
              from importlib.metadata import PackageNotFoundError as DistributionNotFound
              def get_distribution(name):
                  class _Dist:
                      def __init__(self, n):
                          self.project_name = n
                          _imd_distribution(n)
                  return _Dist(name)
          except ImportError:
              class DistributionNotFound(Exception):
                  pass
              def get_distribution(name):
                  raise DistributionNotFound(name)
    PY
    patched = text.gsub(/^from pkg_resources import[^\\n]*\\n/, "#{shim}\\n")
    setup_py.atomic_write(patched) if patched != text
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

${p.serviceBlock}  test do
${p.testDoBody}
  end
end
`;
}
