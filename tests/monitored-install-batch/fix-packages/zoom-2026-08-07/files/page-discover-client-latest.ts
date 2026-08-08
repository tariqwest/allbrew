/**
 * When a marketing site only surfaces App Store / Setapp links, many vendors
 * still ship a stable same-origin installer at /client/latest/<Name>.pkg|dmg
 * (Zoom: https://zoom.us/client/latest/Zoom.pkg). HEAD-probe a small set of
 * guesses so native installers beat MAS for Homebrew cask generation.
 */
export function inventClientLatestArtifactUrls(pageUrl: string): string[] {
  try {
    const u = new URL(pageUrl);
    const host = u.hostname.replace(/^www\./i, "");
    const brand = (host.split(".")[0] || "app").toLowerCase();
    if (!brand || brand.length < 2) return [];
    const Brand = brand.charAt(0).toUpperCase() + brand.slice(1);
    const names = [
      `${Brand}.pkg`,
      `${Brand}.dmg`,
      `${brand}.pkg`,
      `${brand}.dmg`,
      `${brand}InstallerFull.pkg`,
      `${Brand}InstallerFull.pkg`,
      // Zoom historic naming (zoomusInstallerFull.pkg)
      `${brand}usInstallerFull.pkg`,
      `${Brand}usInstallerFull.pkg`,
    ];
    // Marketing sites often redirect to a sibling TLD while stable installers
    // stay on the legacy apex (zoom.com → downloads still on zoom.us).
    const origins = new Set<string>([u.origin, `https://${host}`, `https://www.${host}`]);
    const dualTld: Record<string, string[]> = {
      zoom: ["https://zoom.us", "https://www.zoom.us", "https://zoom.com", "https://www.zoom.com"],
    };
    for (const o of dualTld[brand] || []) origins.add(o);
    // Also try brand.com / brand.us for common dual-domain vendors
    for (const tld of ["com", "us", "io", "app"]) {
      origins.add(`https://${brand}.${tld}`);
      origins.add(`https://www.${brand}.${tld}`);
    }
    const out: string[] = [];
    for (const origin of origins) {
      for (const n of names) out.push(`${origin}/client/latest/${n}`);
    }
    return out;
  } catch {
    return [];
  }
}

export async function enrichClientLatestArtifacts(
  candidates: DiscoverCandidate[],
  pageUrl: string,
  opts: {
    log?: (msg: string) => void;
    maxProbes?: number;
    headOk?: (url: string) => Promise<boolean>;
  } = {},
): Promise<DiscoverCandidate[]> {
  const log = opts.log || (() => {});
  const maxProbes = opts.maxProbes ?? 24;
  const hasNative = candidates.some(
    (c) =>
      c.kind === "cask-dmg" ||
      /\.(dmg|pkg)(?:\?|#|$)/i.test(c.url),
  );
  if (hasNative) return candidates;

  const onlyStoreOrWeak = !candidates.some(
    (c) =>
      c.kind === "cask-dmg" ||
      c.kind === "archive" ||
      c.kind === "bash-script" ||
      /\.(dmg|pkg|zip)(?:\?|#|$)/i.test(c.url),
  );
  // Always allow probe when no native installer; skip if strong non-store already
  if (!onlyStoreOrWeak && candidates.some((c) => c.score >= 90 && c.kind !== "mac-app-store" && c.kind !== "setapp-app" && c.kind !== "unknown")) {
    return candidates;
  }

  // Prefer *Zoom.pkg / *InstallerFull.pkg on zoom.us before exhaustive TLD fan-out
  const allGuesses = inventClientLatestArtifactUrls(pageUrl);
  const rank = (u: string) => {
    let r = 0;
    if (/zoom\.us\/client\/latest\/Zoom\.pkg$/i.test(u)) r += 100;
    if (/zoom\.us\/client\/latest\/zoomusInstallerFull\.pkg$/i.test(u)) r += 90;
    if (/\/client\/latest\/[A-Z][a-zA-Z]+\.pkg$/i.test(u)) r += 40;
    if (/InstallerFull\.pkg$/i.test(u)) r += 20;
    if (/zoom\.us/i.test(u)) r += 15;
    return r;
  };
  const guesses = allGuesses
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, maxProbes);
  if (!guesses.length) return candidates;

  const headOk =
    opts.headOk ||
    (async (url: string) => {
      try {
        assertSafePublicFetchUrl(url);
        const res = await fetch(url, {
          method: "HEAD",
          redirect: "follow",
          headers: { "User-Agent": "allbrew/1.0" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return false;
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        const cl = res.headers.get("content-length");
        // HTML error pages sometimes 200 — require binary-ish type or large length or final .pkg/.dmg
        const finalUrl = res.url || url;
        if (/\.(dmg|pkg)(?:\?|#|$)/i.test(finalUrl)) return true;
        if (ct.includes("html") || ct.includes("text/")) return false;
        if (cl && Number(cl) > 1_000_000) return true;
        return !ct || ct.includes("octet") || ct.includes("package") || ct.includes("disk");
      } catch {
        return false;
      }
    });

  const extras: DiscoverCandidate[] = [];
  for (const g of guesses) {
    try {
      const ok = await headOk(g);
      if (!ok) {
        log(`client/latest probe miss: ${g}`);
        continue;
      }
      const scored = scoreCandidateUrl(g, pageUrl, ["client-latest-guess", "head-ok"]);
      // Ensure native installers outrank MAS (base 90)
      scored.score = Math.max(scored.score, 125);
      scored.kind = "cask-dmg";
      scored.evidence.push("client-latest-native");
      extras.push(scored);
      log(`client/latest probe hit: ${g} (score ${scored.score})`);
    } catch (err: any) {
      log(`client/latest probe failed ${g}: ${err?.message || err}`);
    }
  }
  if (!extras.length) return candidates;
  return mergeCandidates(candidates, extras);
}

/** Prefer direct .dmg/.pkg over App Store / Setapp when both exist. */
export function preferNativeInstallersOverStore(
  candidates: DiscoverCandidate[],
): DiscoverCandidate[] {
  const hasNative = candidates.some(
    (c) =>
      c.kind === "cask-dmg" ||
      /\.(dmg|pkg)(?:\?|#|$)/i.test(c.url),
  );
  if (!hasNative) return candidates;
  return candidates
    .map((c) => {
      if (c.kind === "mac-app-store" || c.kind === "setapp-app") {
        return {
          ...c,
          score: c.score - 40,
          evidence: [...(c.evidence || []), "store-vs-native-penalty"],
        };
      }
      return c;
    })
    .sort((a, b) => b.score - a.score);
}

