/** Proposed rule: refuse Oh My Zsh / home zsh frameworks before install-script generate. */
export const meta = {
  id: "oh-my-zsh-home-framework-refuse",
  severity: "error",
  failureClass: "brew_fail",
  productIntent: "fail_closed_unsupported",
  appliesTo: ["bash-script", "github-repo"],
};

/**
 * @param {{ url?: string, owner?: string, repo?: string, strategy?: string, scriptUrl?: string }} input
 * @returns {null | { refuse: true, reason: string }}
 */
export function matchCase(input) {
  const url = String(input.url || input.scriptUrl || "");
  const owner = String(input.owner || "").toLowerCase();
  const repo = String(input.repo || "").toLowerCase();
  const isOmzRepo =
    (owner === "ohmyzsh" || owner === "robbyrussell") &&
    (repo === "ohmyzsh" || repo === "oh-my-zsh");
  const isOmzInstallSh =
    /raw\.githubusercontent\.com\/(ohmyzsh|robbyrussell)\/(ohmyzsh|oh-my-zsh)\/.+\/tools\/install\.sh/i.test(
      url,
    ) ||
    /github\.com\/(ohmyzsh|robbyrussell)\/(ohmyzsh|oh-my-zsh)/i.test(url);
  if (isOmzRepo || isOmzInstallSh) {
    return {
      refuse: true,
      reason:
        "Oh My Zsh is a home-directory zsh framework (~/.oh-my-zsh); not a Homebrew Cellar package.",
    };
  }
  return null;
}
