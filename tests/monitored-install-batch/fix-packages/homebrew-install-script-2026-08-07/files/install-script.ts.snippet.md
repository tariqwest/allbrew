## Wire-in for `lib/generators/install-script.ts` (collectInstallScriptPayload)

At start of `collectInstallScriptPayload`, after options defaults, fetch body (or reuse download) and:

```ts
import { assertInstallScriptInScope } from "../install-script-analyze.ts";

// After downloadAndHash or with a small body fetch:
const bodyRes = await fetch(url);
const body = bodyRes.ok ? await bodyRes.text() : "";
assertInstallScriptInScope(url, body);
```

Prefer integrating assert before writing the formula so generate fails with a clear OOS error instead of producing a broken `homebrew.rb` that `brew install` cannot succeed on.

## Wire-in for `lib/cli.ts` handleBashScript (optional early reject)

```ts
async function handleBashScript(url, opts) {
  try {
    const res = await fetch(url);
    if (res.ok) {
      const { assertInstallScriptInScope } = await import("./install-script-analyze.ts");
      assertInstallScriptInScope(url, await res.text());
    }
  } catch (e) {
    if (String(e?.message || e).match(/out of scope|system-wide/i)) throw e;
  }
  return await generateWithConfirmation("install-script", { url }, opts);
}
```
