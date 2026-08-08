class Pokete < Formula
  include Language::Python::Virtualenv

  desc "A terminal based Pokemon like game"
  homepage "https://pypi.org/project/pokete/"
  url "https://files.pythonhosted.org/packages/af/9b/53bfe770898bd696acb11a68741ac6d93a2b413dc07e320f50022bffef89/pokete-0.10.0rc4-py3-none-any.whl"
  sha256 "edb3908143706c3d3ecc46977bea3d426e6953b80999db1de6a0495451f2855b"
  license "GPL-3.0-only"

  livecheck do
    url "https://pypi.org/pypi/pokete/json"
    regex(/"version"\s*:\s*"v?([^"\\]+)"/i)
  end

  depends_on "python@3.13"

  # Native wheels (jiter, pydantic-core, …) ship dylib IDs like
  # @rpath/foo.so. Homebrew's fix_dynamic_linkage expands those to long
  # Cellar paths that do not fit the Mach-O header. Preserve @rpath IDs.
  preserve_rpath

  resource "scrap_engine" do
    url "https://files.pythonhosted.org/packages/66/00/ba9b4da282484dccaed1dcf2502592a0c96024f70bed6bb80ea146f9f411/scrap_engine-1.5.4-py3-none-any.whl"
    sha256 "6446fd18bca1f28eed579e25327fcd26f8fb17dc1201acd19a898a27684e73dc"
  end

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
    # Bare short dylib IDs (e.g. Go c-shared libplaysound.osx.so) cannot be
    # expanded to Cellar paths by fix_dynamic_linkage — the Mach-O load command
    # has no headerpad. Rewrite to @rpath/<id> so preserve_rpath leaves them.
    Dir[libexec/"**/*.{so,dylib}"].each do |so|
      next unless File.file?(so)
      id = Utils.popen_read("otool", "-D", so).lines.drop(1).first&.strip
      next if id.nil? || id.empty? || id.include?("/") || id.start_with?("@")
      system "install_name_tool", "-id", "@rpath/#{id}", so
    end
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

  test do
    assert_match version.to_s, shell_output("#{bin}/pokete --version")
  end
end
