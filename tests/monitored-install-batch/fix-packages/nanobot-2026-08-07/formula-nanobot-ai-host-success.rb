class NanobotAi < Formula
  include Language::Python::Virtualenv

  desc "Ultra-lightweight, open-source, self-hosted personal AI agent framework in Python with WebUI, tools, memory, MCP, multi-agent workflows, automation, and chat apps"
  homepage "https://pypi.org/project/nanobot-ai/"
  url "https://files.pythonhosted.org/packages/f6/66/27c946147a2e9d0f2e00507e475edcb19a73d09e3061dbd4ef05059f7cdf/nanobot_ai-0.3.0-py3-none-any.whl"
  sha256 "fb24fa5754661a2704d3b04f592ca7536be83caff062ef2b47989e867129cbe0"
  license "MIT"

  livecheck do
    url "https://pypi.org/pypi/nanobot-ai/json"
    regex(/"version"\s*:\s*"v?([^"\\]+)"/i)
  end

  depends_on "python@3.13"

  # Native wheels (jiter, pydantic-core, …) ship dylib IDs like
  # @rpath/foo.so. Homebrew's fix_dynamic_linkage expands those to long
  # Cellar paths that do not fit the Mach-O header. Preserve @rpath IDs.
  preserve_rpath

  resource "anthropic" do
    url "https://files.pythonhosted.org/packages/63/af/0f5db57b9397a0f3b7fc204cbef143401a7cadaf982330f97f1ce3d39f34/anthropic-0.120.2-py3-none-any.whl"
    sha256 "0f0bc2b381dc0eb41c8d886b815d79c2041cd2374f83aed36f574b6dc9c579c1"
  end

  resource "anyio" do
    url "https://files.pythonhosted.org/packages/da/35/f2287558c17e29fafc8ef3daf819bb9834061cfa43bff8014f7df7f63bdc/anyio-4.14.2-py3-none-any.whl"
    sha256 "9f505dda5ac9f0c8309b5e8bd445a8c2bf7246f3ce950121e45ea15bc41d1494"
  end

  resource "idna" do
    url "https://files.pythonhosted.org/packages/1e/5e/d4e9f1a599fb8e573b7b87160658329fbf28d19eac2718f51fc3def3aa5a/idna-3.18-py3-none-any.whl"
    sha256 "7f952cbe720b688055e3f87de14f5c3e5fdaa8bc3928985c4077ca689de849a2"
  end

  resource "distro" do
    url "https://files.pythonhosted.org/packages/12/b3/231ffd4ab1fc9d679809f356cebee130ac7daa00d6d6f3206dd4fd137e9e/distro-1.9.0-py3-none-any.whl"
    sha256 "7bffd925d65168f85027d8da9af6bddab658135b840670a223589bc0c8ef02b2"
  end

  resource "docstring-parser" do
    url "https://files.pythonhosted.org/packages/a7/5f/ed01f9a3cdffbd5a008556fc7b2a08ddb1cc6ace7effa7340604b1d16699/docstring_parser-0.18.0-py3-none-any.whl"
    sha256 "b3fcbed555c47d8479be0796ef7e19c2670d428d72e96da63f3a40122860374b"
  end

  resource "httpx" do
    url "https://files.pythonhosted.org/packages/2a/39/e50c7c3a983047577ee07d2a9e53faf5a69493943ec3f6a384bdc792deb2/httpx-0.28.1-py3-none-any.whl"
    sha256 "d909fcccc110f8c7faf814ca82a9a4d816bc5a6dbfea25d6591d6985b8ba59ad"
  end

  resource "certifi" do
    url "https://files.pythonhosted.org/packages/0b/a7/71ac2cff56fec219ed242bb11b8efb69fcc4bec75db06fb7bfe35de520e6/certifi-2026.7.22-py3-none-any.whl"
    sha256 "62f22742b58a1a33014a2b6b706588a8d7e2a88ae7bd1a6ebe8c992928483775"
  end

  resource "httpcore" do
    url "https://files.pythonhosted.org/packages/7e/f5/f66802a942d491edb555dd61e3a9961140fd64c90bce1eafd741609d334d/httpcore-1.0.9-py3-none-any.whl"
    sha256 "2d400746a40668fc9dec9810239072b40b4484b640a8c38fd654a024c7a1bf55"
  end

  resource "h11" do
    url "https://files.pythonhosted.org/packages/04/4b/29cac41a4d98d144bf5f6d33995617b185d14b22401f75ca86f384e87ff1/h11-0.16.0-py3-none-any.whl"
    sha256 "63cf8bbe7522de3bf65932fda1d9c2772064ffb3dae62d55932da54b31cb6c86"
  end

  resource "jiter" do
    url "https://files.pythonhosted.org/packages/d0/2b/c3eaf16f5d7c9bad66ea32f40a95bd169b29a91217fcc7f081375157e99c/jiter-0.16.0-cp313-cp313-macosx_11_0_arm64.whl"
    sha256 "d28bb3c26762358dadf3e5bf0bccd29ae987d65e6988d2e6f49829c76b003c09"
  end

  resource "pydantic" do
    url "https://files.pythonhosted.org/packages/fd/7b/122376b1fd3c62c1ed9dc80c931ace4844b3c55407b6fb2d199377c9736f/pydantic-2.13.4-py3-none-any.whl"
    sha256 "45a282cde31d808236fd7ea9d919b128653c8b38b393d1c4ab335c62924d9aba"
  end

  resource "annotated-types" do
    url "https://files.pythonhosted.org/packages/99/91/8acff4f5e50511b911bbccb72b8628a49c68ce14148cd9f6431094859a90/annotated_types-0.8.0-py3-none-any.whl"
    sha256 "f072f4d804ea359e4eaf198b1af7a8b0943881a87f31bb764f8bf219bb9419e0"
  end

  resource "pydantic-core" do
    url "https://files.pythonhosted.org/packages/c1/81/4fa520eaffa8bd7d1525e644cd6d39e7d60b1592bc5b516693c7340b50f1/pydantic_core-2.46.4-cp313-cp313-macosx_11_0_arm64.whl"
    sha256 "c94f0688e7b8d0a67abf40e57a7eaaecd17cc9586706a31b76c031f63df052b4"
  end

  resource "typing-extensions" do
    url "https://files.pythonhosted.org/packages/49/d3/b8441a820a491ddfc024b0b0cf0393375b75ea13866d9c66727e54c2fc80/typing_extensions-4.16.0-py3-none-any.whl"
    sha256 "481caa481374e813c1b176ada14e97f1f67a4539ce9cfeb3f350d78d6370c2e8"
  end

  resource "typing-inspection" do
    url "https://files.pythonhosted.org/packages/dc/9b/47798a6c91d8bdb567fe2698fe81e0c6b7cb7ef4d13da4114b41d239f65d/typing_inspection-0.4.2-py3-none-any.whl"
    sha256 "4ed1cacbdc298c220f1bd249ed5287caa16f34d44ef4e9c3d0cbad5b521545e7"
  end

  resource "sniffio" do
    url "https://files.pythonhosted.org/packages/e9/44/75a9c9421471a6c4805dbf2356f7c181a29c1879239abab1ea2cc8f38b40/sniffio-1.3.1-py3-none-any.whl"
    sha256 "2f6da418d1f1e0fddd844478f41680e794e6051915791a034ff65e5f100525a2"
  end

  resource "chardet" do
    url "https://files.pythonhosted.org/packages/38/6f/f5fbc992a329ee4e0f288c1fe0e2ad9485ed064cac731ed2fe47dcc38cbf/chardet-5.2.0-py3-none-any.whl"
    sha256 "e1cf59446890a00105fe7b7912492ea04b6e6f06d4b742b2c788469e34c82970"
  end

  resource "croniter" do
    url "https://files.pythonhosted.org/packages/cd/ba/d678e5bd329646ca51d3c92addbc77804e86d21f4b6b6a027218e6abb010/croniter-6.2.4-py3-none-any.whl"
    sha256 "8ef3d544107a5c05a150a2d78f8bf5a8eb9c5c4d93405a736b824109574e3f4d"
  end

  resource "python-dateutil" do
    url "https://files.pythonhosted.org/packages/ec/57/56b9bcc3c9c6a792fcbaf139543cee77261f3651ca9da0c93f5c1221264b/python_dateutil-2.9.0.post0-py2.py3-none-any.whl"
    sha256 "a8b2bc7bffae282281c8140a97d3aa9c14da0b136dfe83f850eea9a5f7470427"
  end

  resource "six" do
    url "https://files.pythonhosted.org/packages/b7/ce/149a00dd41f10bc29e5921b496af8b574d8413afcd5e30dfa0ed46c2cc5e/six-1.17.0-py2.py3-none-any.whl"
    sha256 "4721f391ed90541fddacab5acf947aa0d3dc7d27b2e1e8eda2be8970586c3274"
  end

  resource "ddgs" do
    url "https://files.pythonhosted.org/packages/e8/5f/32de4d99220eb559b7b1cd1c529a1856efa8097f7a3e10b6c207aa95e36c/ddgs-9.14.4-py3-none-any.whl"
    sha256 "acb084c34bf1110c974caf7e5e5a2c1973beb4bd9e170bfd191fe5ed2d2b2d6c"
  end

  resource "click" do
    url "https://files.pythonhosted.org/packages/fb/e2/79c688af8b210d232694e31e59da9f6ec747bae31c3f5946e4e9b98860d5/click-8.4.2-py3-none-any.whl"
    sha256 "e6f9f66136c816745b9d65817da91d61d957fb16e02e4dcd0552553c5a197b76"
  end

  resource "primp" do
    url "https://files.pythonhosted.org/packages/58/c1/c965cc23f96a364803d44b4331f33e4465bb6f269add37e39d0ad77ffe33/primp-1.3.1-cp310-abi3-macosx_11_0_arm64.whl"
    sha256 "27a8804eb9a3f641f379ee2b443591428cf85c898816e93d04d3e7b6f229ebcb"
  end

  resource "lxml" do
    url "https://files.pythonhosted.org/packages/a5/eb/7e6f37c5584ccbb2ff267f56fd0339016938c1c8684cfefab9b33ffc2f36/lxml-6.1.1-cp313-cp313-macosx_10_13_universal2.whl"
    sha256 "68a9198d0fc122d14bb76837de9aa80cf84caed990b5b237f532ed87d3706736"
  end

  resource "brotli" do
    url "https://files.pythonhosted.org/packages/6c/d4/4ad5432ac98c73096159d9ce7ffeb82d151c2ac84adcc6168e476bb54674/brotli-1.2.0-cp313-cp313-macosx_10_13_universal2.whl"
    sha256 "9e5825ba2c9998375530504578fd4d5d1059d09621a02065d1b6bfc41a8e05ab"
  end

  resource "brotlicffi" do
    url "https://files.pythonhosted.org/packages/9a/9f/b98dcd4af47994cee97aebac866996a006a2e5fc1fd1e2b82a8ad95cf09c/brotlicffi-1.2.0.1-cp38-abi3-macosx_11_0_arm64.whl"
    sha256 "91ba5f0ccc040f6ff8f7efaf839f797723d03ed46acb8ae9408f99ffd2572cf4"
  end

  resource "cffi" do
    url "https://files.pythonhosted.org/packages/55/41/4c7042f317b9217502988f0873af87e16ad606dc20f84e546e3e6ce9764c/cffi-2.1.1-cp313-cp313-macosx_11_0_arm64.whl"
    sha256 "19ee6127ee34de7d83ce3d371ebc5ed91addbdcc39f9ab15ce4eb35a4e534971"
  end

  resource "pycparser" do
    url "https://files.pythonhosted.org/packages/0c/c3/44f3fbbfa403ea2a7c779186dc20772604442dde72947e7d01069cbe98e3/pycparser-3.0-py3-none-any.whl"
    sha256 "b727414169a36b7d524c1c3e31839a521725078d7b2ff038656844266160a992"
  end

  resource "h2" do
    url "https://files.pythonhosted.org/packages/7e/22/e85faf23bd72a92d1921e37d674ca56eb298a3c8be31fdecef0ff2b3aaac/h2-4.4.1-py3-none-any.whl"
    sha256 "0e25f1462b23c9cb82d9eb02e28bc706dac2a68cb457c6a0d74d63c8a2a5d0e6"
  end

  resource "hyperframe" do
    url "https://files.pythonhosted.org/packages/48/30/47d0bf6072f7252e6521f3447ccfa40b421b6824517f82854703d0f5a98b/hyperframe-6.1.0-py3-none-any.whl"
    sha256 "b03380493a519fce58ea5af42e4a42317bf9bd425596f7a0835ffce80f1a42e5"
  end

  resource "hpack" do
    url "https://files.pythonhosted.org/packages/71/b4/4a9fcfb2aef6ba44d9073ecd301443aa00b3dac95de5619f2a7de7ec8a91/hpack-4.2.0-py3-none-any.whl"
    sha256 "858ac0b02280fa582b5080d68db0899c62a80375e0e5413a74970c5e518b6986"
  end

  resource "socksio" do
    url "https://files.pythonhosted.org/packages/37/c3/6eeb6034408dac0fa653d126c9204ade96b819c936e136c5e8a6897eee9c/socksio-1.0.0-py3-none-any.whl"
    sha256 "95dc1f15f9b34e8d7b16f06d74b8ccf48f609af32ab33c608d08761c5dcbb1f3"
  end

  resource "fake-useragent" do
    url "https://files.pythonhosted.org/packages/51/37/b3ea9cd5558ff4cb51957caca2193981c6b0ff30bd0d2630ac62505d99d0/fake_useragent-2.2.0-py3-none-any.whl"
    sha256 "67f35ca4d847b0d298187443aaf020413746e56acd985a611908c73dba2daa24"
  end

  resource "defusedxml" do
    url "https://files.pythonhosted.org/packages/07/6c/aa3f2f849e01cb6a001cd8554a88d4c77c5c1a31c95bdf1cf9301e6d9ef4/defusedxml-0.7.1-py2.py3-none-any.whl"
    sha256 "a352e7e428770286cc899e2542b6cdaedb2b4953ff269a210103ec58f6198a61"
  end

  resource "dulwich" do
    url "https://files.pythonhosted.org/packages/87/eb/153b2b32dca090e956a1e512293db3c7c144db50da439373d1be56880512/dulwich-0.25.2-py3-none-any.whl"
    sha256 "19dd5a0e08a47483be7f404e2555136a9ebaf70781fee3280457f8e2d65b2388"
  end

  resource "urllib3" do
    url "https://files.pythonhosted.org/packages/7f/3e/5db95bcf282c52709639744ca2a8b149baccf648e39c8cc87553df9eae0c/urllib3-2.7.0-py3-none-any.whl"
    sha256 "9fb4c81ebbb1ce9531cce37674bbc6f1360472bc18ca9a553ede278ef7276897"
  end

  resource "filelock" do
    url "https://files.pythonhosted.org/packages/c1/e8/72f8cef9fdfeffe06213fe8508039396ee48daa0e3259457ed766173bfd6/filelock-3.32.2-py3-none-any.whl"
    sha256 "87dd94cf281e586d135fa51132b8e3d9a598b316e90377a288663c9321036c82"
  end

  resource "jinja2" do
    url "https://files.pythonhosted.org/packages/62/a1/3d680cbfd5f4b8f15abc1d571870c5fc3e594bb582bc3b64ea099db13e56/jinja2-3.1.6-py3-none-any.whl"
    sha256 "85ece4451f492d0c13c5dd7c13a64681a86afae63a5f347908daf103ce6d2f67"
  end

  resource "MarkupSafe" do
    url "https://files.pythonhosted.org/packages/9c/d9/5f7756922cdd676869eca1c4e3c0cd0df60ed30199ffd775e319089cb3ed/markupsafe-3.0.3-cp313-cp313-macosx_11_0_arm64.whl"
    sha256 "116bb52f642a37c115f517494ea5feb03889e04df47eeff5b130b1808ce7c219"
  end

  resource "json-repair" do
    url "https://files.pythonhosted.org/packages/63/45/924a75372c1a264068158eb5b557932d15a4e42cbbb9e14a73ca076d3c01/json_repair-0.62.0-py3-none-any.whl"
    sha256 "1ea917bb2eae205a2c012ab2aa1c0bc6ea9ac708836d203577fac46fcd84f443"
  end

  resource "loguru" do
    url "https://files.pythonhosted.org/packages/0c/29/0348de65b8cc732daa3e33e67806420b2ae89bdce2b04af740289c5c6c8c/loguru-0.7.3-py3-none-any.whl"
    sha256 "31a33c10c8e1e10422bfd431aeb5d351c7cf7fa671e3c4df004162264b28220c"
  end

  resource "lxml-html-clean" do
    url "https://files.pythonhosted.org/packages/6a/bd/6e2b76a6c5dee10397db9c929f0c5066766ec1036046f0335b7ca7ca08b8/lxml_html_clean-0.4.5-py3-none-any.whl"
    sha256 "c76fcadd1e5bfb9b8bafc2200d51e4e78eb0dad67f56881c21dfb6484c7e7746"
  end

  resource "mcp" do
    url "https://files.pythonhosted.org/packages/01/c8/248b201f6d753d69fd5d6506011abbb35a946d9142b2ae311a948fd0be3d/mcp-1.29.0-py3-none-any.whl"
    sha256 "f5a075bb611f23d6f4d080c6a1699fa62772eebc562ba9e66b306ddde1c755f7"
  end

  resource "httpx-sse" do
    url "https://files.pythonhosted.org/packages/d2/fd/6668e5aec43ab844de6fc74927e155a3b37bf40d7c3790e49fc0406b6578/httpx_sse-0.4.3-py3-none-any.whl"
    sha256 "0ac1c9fe3c0afad2e0ebb25a934a59f4c7823b60792691f779fad2c5568830fc"
  end

  resource "jsonschema" do
    url "https://files.pythonhosted.org/packages/69/90/f63fb5873511e014207a475e2bb4e8b2e570d655b00ac19a9a0ca0a385ee/jsonschema-4.26.0-py3-none-any.whl"
    sha256 "d489f15263b8d200f8387e64b4c3a75f06629559fb73deb8fdfb525f2dab50ce"
  end

  resource "attrs" do
    url "https://files.pythonhosted.org/packages/64/b4/17d4b0b2a2dc85a6df63d1157e028ed19f90d4cd97c36717afef2bc2f395/attrs-26.1.0-py3-none-any.whl"
    sha256 "c647aa4a12dfbad9333ca4e71fe62ddc36f4e63b2d260a37a8b83d2f043ac309"
  end

  resource "jsonschema-specifications" do
    url "https://files.pythonhosted.org/packages/41/45/1a4ed80516f02155c51f51e8cedb3c1902296743db0bbc66608a0db2814f/jsonschema_specifications-2025.9.1-py3-none-any.whl"
    sha256 "98802fee3a11ee76ecaca44429fda8a41bff98b00a0f2838151b113f210cc6fe"
  end

  resource "referencing" do
    url "https://files.pythonhosted.org/packages/2c/58/ca301544e1fa93ed4f80d724bf5b194f6e4b945841c5bfd555878eea9fcb/referencing-0.37.0-py3-none-any.whl"
    sha256 "381329a9f99628c9069361716891d34ad94af76e461dcb0335825aecc7692231"
  end

  resource "rpds-py" do
    url "https://files.pythonhosted.org/packages/f3/6b/686d9dc4359a8f163cfbbf89ee0b4e586431de22fe8248edb63a8cf50d49/rpds_py-2026.6.3-cp313-cp313-macosx_11_0_arm64.whl"
    sha256 "f4d78253f6996be4901669ad25319f842f740eccf4d58e3c7f3dd39e6dde1d8f"
  end

  resource "pydantic-settings" do
    url "https://files.pythonhosted.org/packages/77/c1/6e422f34e569cf8e18df68d1939c81c099d2b61e4f7d9621c8a77560799c/pydantic_settings-2.14.2-py3-none-any.whl"
    sha256 "a20c97b37910b6550d5ea50fbcc2d4187defe58cd57070b73863d069419c9440"
  end

  resource "python-dotenv" do
    url "https://files.pythonhosted.org/packages/0b/d7/1959b9648791274998a9c3526f6d0ec8fd2233e4d4acce81bbae76b44b2a/python_dotenv-1.2.2-py3-none-any.whl"
    sha256 "1d8214789a24de455a8b8bd8ae6fe3c6b69a5e3d64aa8a8e5d68e694bbcb285a"
  end

  resource "pyjwt" do
    url "https://files.pythonhosted.org/packages/a3/5e/ecf12fdb62546d64385c158514e9b2b671f7832108ef2ecd2020ce0af2d1/pyjwt-2.13.0-py3-none-any.whl"
    sha256 "66adcc2aff09b3f1bbd95fc1e1577df8ac8723c978552fd43304c8a290ac5728"
  end

  resource "cryptography" do
    url "https://files.pythonhosted.org/packages/c5/5c/59086b4aac5e879d38ddbcf74e4be7ade89cebc3eb199a55da998c3bb46a/cryptography-50.0.0-cp311-abi3-macosx_11_0_arm64.whl"
    sha256 "031e2d5dd4bb9caa3ca9c82e5a197fd8ae680232cee62603d1a813f3f07e3d03"
  end

  resource "python-multipart" do
    url "https://files.pythonhosted.org/packages/e1/04/e8135ebd1ad02c56ec633277529b2602ff99ff634be76cdba5744cf554fd/python_multipart-0.0.32-py3-none-any.whl"
    sha256 "ff6d3f776f16878c894e52e107296ffc890e913c611b1a4ec6c44e2821fe2e23"
  end

  resource "sse-starlette" do
    url "https://files.pythonhosted.org/packages/dd/3a/764912c58293d95b6dcdf4cc255f9d10de310580ced547b082eb9d72018c/sse_starlette-3.4.8-py3-none-any.whl"
    sha256 "6e82314c786709a3cd9520f2285cf9fff90e181e598e8a357b0cf80f66afba0d"
  end

  resource "starlette" do
    url "https://files.pythonhosted.org/packages/75/0a/67e95f21498de41433babf7b1db0eeab449eb58872dfb831b27747a70fd0/starlette-1.4.1-py3-none-any.whl"
    sha256 "7d078e0fbefae0d2cecfb80a799d6fb84b1c0c6acd4f14ac79d17d0e7ec27f19"
  end

  resource "uvicorn" do
    url "https://files.pythonhosted.org/packages/c7/d5/68e6e9bca63c0badf67002890a46d3784c958de45b65e1275ec583ca1f06/uvicorn-0.52.1-py3-none-any.whl"
    sha256 "e4403f9d93188cf9d1088e9f40e3acd12630e2df8675316704379a7fc20fff6a"
  end

  resource "oauth-cli-kit" do
    url "https://files.pythonhosted.org/packages/ff/9f/53555ec2543e6ba5f6eeff4331cca43842a2c48983c793c97560500b6764/oauth_cli_kit-0.1.6-py3-none-any.whl"
    sha256 "d4a73beae7333ae642a9e5766ab0a04de53279667fefdf064c23db77a3494e7f"
  end

  resource "platformdirs" do
    url "https://files.pythonhosted.org/packages/7d/68/d8d58938dfb1370b266a1a729e6d77a985be23689a0496498ee17b2cbf90/platformdirs-4.11.0-py3-none-any.whl"
    sha256 "360ccded2b7fce0af0ff80cc8f5942a1c5d99b0e856033acb030bfc634709e74"
  end

  resource "openai" do
    url "https://files.pythonhosted.org/packages/78/0f/cc6afea3542a5142c5d8fc8211c5e059a8375105d004a41dfa2c7948dbb0/openai-2.53.0-py3-none-any.whl"
    sha256 "c694ffc747a3c4d1663ef2b07b811315a476164ee5efa3a993967349ebca7618"
  end

  resource "tqdm" do
    url "https://files.pythonhosted.org/packages/f9/1c/01bfd571a64e7f270e6bab5e33777debe0edc56759233ce84f27dec92d14/tqdm-4.70.0-py3-none-any.whl"
    sha256 "7f585706bfddbdebf89daac705b2dfcc16890130727d3197ca62c732b4310953"
  end

  resource "openpyxl" do
    url "https://files.pythonhosted.org/packages/c0/da/977ded879c29cbd04de313843e76868e6e13408a94ed6b987245dc7c8506/openpyxl-3.1.5-py2.py3-none-any.whl"
    sha256 "5282c12b107bffeef825f4617dc029afaf41d0ea60823bbb665ef3079dc79de2"
  end

  resource "et-xmlfile" do
    url "https://files.pythonhosted.org/packages/c1/8b/5fe2cc11fee489817272089c4203e679c63b570a5aaeb18d852ae3cbba6a/et_xmlfile-2.0.0-py3-none-any.whl"
    sha256 "7a91720bc756843502c3b7504c77b8fe44217c85c537d85037f0f536151b2caa"
  end

  resource "packaging" do
    url "https://files.pythonhosted.org/packages/63/34/ba1c580383c9eada3711951fef0795c80b829a078d72188184bcab9dd527/packaging-26.3-py3-none-any.whl"
    sha256 "d7193f7c8e4e93f444fde0262bf90af30e16fa0ad0ad44cb553c87339b23cd1c"
  end

  resource "prompt-toolkit" do
    url "https://files.pythonhosted.org/packages/54/6f/84908cad2d6aa5144abcf7b42709fe4fdb459bc640ec7ac5786e7693dabc/prompt_toolkit-3.0.53-py3-none-any.whl"
    sha256 "01c0891d7f9237d5e339f7d3e42cdae80b7534abb1c7c0e3352efba6231492f2"
  end

  resource "wcwidth" do
    url "https://files.pythonhosted.org/packages/96/42/3e5985a0a7e57de470b320c6d6a1a67c844f6737a587f3d44dd13d1819e7/wcwidth-0.8.2-py3-none-any.whl"
    sha256 "d63947694a0539a1d51e01eda7caf800c291020e6cdd7e28ad7b14dd33ad4f85"
  end

  resource "pypdf" do
    url "https://files.pythonhosted.org/packages/48/d9/6cff57c80a6963e7dd183bf09e9f21604a77716644b1e580e97b259f7612/pypdf-5.9.0-py3-none-any.whl"
    sha256 "be10a4c54202f46d9daceaa8788be07aa8cd5ea8c25c529c50dd509206382c35"
  end

  resource "python-docx" do
    url "https://files.pythonhosted.org/packages/d0/00/1e03a4989fa5795da308cd774f05b704ace555a70f9bf9d3be057b680bcf/python_docx-1.2.0-py3-none-any.whl"
    sha256 "3fd478f3250fbbbfd3b94fe1e985955737c145627498896a8a6bf81f4baf66c7"
  end

  resource "python-pptx" do
    url "https://files.pythonhosted.org/packages/d9/4f/00be2196329ebbff56ce564aa94efb0fbc828d00de250b1980de1a34ab49/python_pptx-1.0.2-py3-none-any.whl"
    sha256 "160838e0b8565a8b1f67947675886e9fea18aa5e795db7ae531606d68e785cba"
  end

  resource "Pillow" do
    url "https://files.pythonhosted.org/packages/10/76/8803c13605b763d33d156c4678fc77f8443389c0c51c8aef707bb02015f4/pillow-12.3.0-cp313-cp313-macosx_11_0_arm64.whl"
    sha256 "d69141514cc30b774ceea5e3ed3a6635c8d8a96edf664689b890f4089111fb35"
  end

  resource "XlsxWriter" do
    url "https://files.pythonhosted.org/packages/3a/0c/3662f4a66880196a590b202f0db82d919dd2f89e99a27fadef91c4a33d41/xlsxwriter-3.2.9-py3-none-any.whl"
    sha256 "9a5db42bc5dff014806c58a20b9eae7322a134abb6fce3c92c181bfb275ec5b3"
  end

  resource "pyyaml" do
    url "https://files.pythonhosted.org/packages/b1/16/95309993f1d3748cd644e02e38b75d50cbc0d9561d21f390a76242ce073f/pyyaml-6.0.3-cp313-cp313-macosx_11_0_arm64.whl"
    sha256 "2283a07e2c21a2aa78d9c4442724ec1eb15f5e42a723b99cb3d822d48f5f7ad1"
  end

  resource "questionary" do
    url "https://files.pythonhosted.org/packages/3c/26/1062c7ec1b053db9e499b4d2d5bc231743201b74051c973dadeac80a8f43/questionary-2.1.1-py3-none-any.whl"
    sha256 "a51af13f345f1cdea62347589fbb6df3b290306ab8930713bfae4d475a7d4a59"
  end

  resource "readability-lxml" do
    url "https://files.pythonhosted.org/packages/c7/75/2cc58965097e351415af420be81c4665cf80da52a17ef43c01ffbe2caf91/readability_lxml-0.8.4.1-py3-none-any.whl"
    sha256 "874c0cea22c3bf2b78c7f8df831bfaad3c0a89b7301d45a188db581652b4b465"
  end

  resource "cssselect" do
    url "https://files.pythonhosted.org/packages/60/e9/6734502f67533a752ea8b1c8f7f227c94eecf300252ba8bf23e3e59d8a36/cssselect-1.5.0-py3-none-any.whl"
    sha256 "1d1aded98e82bdde447ded990a191fd6916177c4f0c914fb62eccd58e2ffcdcc"
  end

  resource "rich" do
    url "https://files.pythonhosted.org/packages/b3/76/6d163cfac87b632216f71879e6b2cf17163f773ff59c00b5ff4900a80fa3/rich-14.3.4-py3-none-any.whl"
    sha256 "07e7adb4690f68864777b1450859253bed81a99a31ac321ac1817b2313558952"
  end

  resource "markdown-it-py" do
    url "https://files.pythonhosted.org/packages/b3/81/4da04ced5a082363ecfa159c010d200ecbd959ae410c10c0264a38cac0f5/markdown_it_py-4.2.0-py3-none-any.whl"
    sha256 "9f7ebbcd14fe59494226453aed97c1070d83f8d24b6fc3a3bcf9a38092641c4a"
  end

  resource "mdurl" do
    url "https://files.pythonhosted.org/packages/b3/38/89ba8ad64ae25be8de66a6d463314cf1eb366222074cfda9ee839c56a4b4/mdurl-0.1.2-py3-none-any.whl"
    sha256 "84008a41e51615a49fc9966191ff91509e3c40b939176e643fd50a5c2196b8f8"
  end

  resource "pygments" do
    url "https://files.pythonhosted.org/packages/f4/7e/a72dd26f3b0f4f2bf1dd8923c85f7ceb43172af56d63c7383eb62b332364/pygments-2.20.0-py3-none-any.whl"
    sha256 "81a9e26dd42fd28a23a2d169d86d7ac03b46e2f8b59ed4698fb4785f946d0176"
  end

  resource "tiktoken" do
    url "https://files.pythonhosted.org/packages/53/61/c68e123b6d753e3fc2751e9b18e732c9d8bf1e1926762e736eee935d931c/tiktoken-0.13.0-cp313-cp313-macosx_11_0_arm64.whl"
    sha256 "8fe806a50664e83a6ffd56cbd1e4f5dcc6cd32a3e7538f70dc38b1a271384545"
  end

  resource "regex" do
    url "https://files.pythonhosted.org/packages/95/47/2d0564e93d87bc48618360ddca232a2ca612bbdf53ce8465d45ca5ce14ee/regex-2026.7.19-cp313-cp313-macosx_11_0_arm64.whl"
    sha256 "40b34dd88658e4fedd2fddbf0275ac970d00614b731357f425722a3ed1983d11"
  end

  resource "requests" do
    url "https://files.pythonhosted.org/packages/a0/f4/c67b0b3f1b9245e8d266f0f112c500d50e5b4e83cb6f3b71b6528104182a/requests-2.34.2-py3-none-any.whl"
    sha256 "2a0d60c172f83ac6ab31e4554906c0f3b3588d37b5cb939b1c061f4907e278e0"
  end

  resource "charset_normalizer" do
    url "https://files.pythonhosted.org/packages/98/2b/f97f1c193fb855c345d678f5077d6926034db0722df74c8f057020e05a25/charset_normalizer-3.4.9-py3-none-any.whl"
    sha256 "68e5f26a1ad57ded6d1cfb85331d1c1a195314756471d97758c48498bb4dcdf5"
  end

  resource "typer" do
    url "https://files.pythonhosted.org/packages/43/89/9518bc0c3929bee36b3a4a8e3daddd6e03f92f9961c66d4983b837160543/typer-0.27.1-py3-none-any.whl"
    sha256 "53150287edd11baeb4e4722c8e394fcdf8181c0ae89485cba8d25c778d5edd56"
  end

  resource "shellingham" do
    url "https://files.pythonhosted.org/packages/e0/f9/0595336914c5619e5f28a1fb793285925a8cd4b432c9da0a987836c7f822/shellingham-1.5.4-py2.py3-none-any.whl"
    sha256 "7ecfff8f2fd72616f7481040475a65b2bf8af90a56c89140852d1120324e8686"
  end

  resource "annotated-doc" do
    url "https://files.pythonhosted.org/packages/3e/30/e900b21425a860e195f32e37657aa1f7c7f2b1bfb26f03ca209b90933c06/annotated_doc-0.0.5-py3-none-any.whl"
    sha256 "117bac03a25ede5df5440e855b32d556049ca169ead221505badf432fed4b101"
  end

  resource "watchfiles" do
    url "https://files.pythonhosted.org/packages/31/3a/0da302f2307aee316922806ebd5726c542cbd787c938271cf14a074c7daf/watchfiles-1.2.0-cp313-cp313-macosx_11_0_arm64.whl"
    sha256 "7ba0480b9a74af058f43b337e937a451e109295c420916d68ad24e3dc02f5e44"
  end

  resource "websocket-client" do
    url "https://files.pythonhosted.org/packages/34/db/b10e48aa8fff7407e67470363eac595018441cf32d5e1001567a7aeba5d2/websocket_client-1.9.0-py3-none-any.whl"
    sha256 "af248a825037ef591efbf6ed20cc5faa03d3b47b9e5a2230a529eeee1c1fc3ef"
  end

  resource "websockets" do
    url "https://files.pythonhosted.org/packages/be/4d/2d0d67834092e354d2b0498f014a41249a89556bc406cf86f3e1557bb463/websockets-16.1.1-py3-none-any.whl"
    sha256 "6abbd3e82c731c8e531714466acd5d87b5e88ac3243465337ba71d68e23ae7e3"
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
    run [opt_bin/"nanobot", "gateway"]
    keep_alive true
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/nanobot --version")
  end
end
