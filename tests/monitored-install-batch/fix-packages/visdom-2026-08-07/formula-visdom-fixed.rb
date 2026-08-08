class Visdom < Formula
  include Language::Python::Virtualenv

  desc "A flexible tool for creating, organizing, and sharing visualizations of live, rich data. Supports Torch and Numpy https://visdom.dev"
  homepage "https://github.com/facebookresearch/visdom"
  url "https://files.pythonhosted.org/packages/31/ab/6a8df57477ea6bb65b828f0b6725255982dfcd02f7ed353b895393616875/visdom-0.2.4.tar.gz"
  sha256 "84a911d3c8814a056d54812b381bd938cb44bcfc503a85fe0f701502bb720574"
  license "Apache-2.0"

  livecheck do
    url "https://pypi.org/pypi/visdom/json"
    regex(/"version"\s*:\s*"v?([^"\\]+)"/i)
  end

  depends_on "python@3.13"

  # Native wheels (jiter, pydantic-core, …) ship dylib IDs like
  # @rpath/foo.so. Homebrew's fix_dynamic_linkage expands those to long
  # Cellar paths that do not fit the Mach-O header. Preserve @rpath IDs.
  preserve_rpath

  def install
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
          "include-system-site-packages = false\n"
        else
          line
        end
      end
      lines << "include-system-site-packages = false\n" unless replaced
      pyvenv_cfg.atomic_write(lines.join)
    end
    resources.each { |r| pip_install_dist(venv, r) }
    pip_install_main(venv)
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

  service do
    run opt_bin/"visdom"
    keep_alive true
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/visdom --version")
  end
end
