/** Proposed rule: prefer primary product release assets over lib*/secondary runtimes and deltas. */
export const meta = {
  id: "binary-release-prefer-primary-product-asset",
  title: "Prefer product-stem release zips over lib*/denort/bsdiff",
  severity: "error",
  appliesTo: ["binary-release", "github-repo"],
};

/**
 * @param {{ assetNames?: string[], productName?: string }} input
 * @returns {{ prefer: string[], reject: string[] } | null}
 */
export function matchCase(input) {
  const assets = input.assetNames || [];
  const product = (input.productName || "").toLowerCase().replace(/-tap\d*$/, "");
  if (!product || assets.length < 2) return null;
  const primary = assets.filter((a) =>
    new RegExp(`^${product}[-_.]`, "i").test(a) && !/\.(bsdiff|delta)$/i.test(a),
  );
  const secondary = assets.filter(
    (a) =>
      /^lib/i.test(a) ||
      (product && new RegExp(`^${product}[a-z]`, "i").test(a)) ||
      /\.(bsdiff|delta)$/i.test(a),
  );
  if (primary.length && secondary.length) {
    return { prefer: primary, reject: secondary };
  }
  return null;
}
