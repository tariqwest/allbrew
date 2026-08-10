#!/usr/bin/env bun
/**
 * Render a URL with JS execution (Bun.WebView when available) and update
 * the monitored-install agent-judgment.json with a WebView-aware judgment.
 *
 * Usage:
 *   bun .agents/skills/monitored-install/scripts/render-judgment.mjs \
 *     --url "https://example.com" --run-dir "tests/monitored-install-runs/<runId>"
 *     [--slug myapp] [--force]
 *
 * Behavior:
 *  - If Bun.WebView is available, navigates with JS, waits for idle, then
 *    extracts rendered `document.body.innerText` + `outerHTML`.
 *  - Falls back to static fetch when WebView unavailable or on failure.
 *  - Runs lib/analyzer.ts:detectScriptInstall regexes (CURL_PIPE_SHELL_RE etc.)
 *    plus BARE_SCRIPT_URL_RE over rendered text/HTML to decide inputShape.
 *  - Updates $RUN_DIR/agent-judgment.json: inputShape, expected (bash-script/
 *    install-script when curl|bash found), notes, and preserves other fields.
 *  - Never throws on network/render failure; logs and leaves judgment null
 *    for manual fill if needed.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

function arg(flag, fallback = "") {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}
function hasFlag(flag) {
  return process.argv.includes(flag);
}

const url = arg("--url");
const runDirArg = arg("--run-dir");
const slugArg = arg("--slug");
if (!url) {
  console.error("--url is required");
  process.exit(2);
}
if (!runDirArg) {
  console.error("--run-dir is required (path to tests/monitored-install-runs/<runId>)");
  process.exit(2);
}
const runDir = resolve(runDirArg);
const judgmentPath = join(runDir, "agent-judgment.json");
if (!existsSync(judgmentPath)) {
  console.error(`agent-judgment.json not found in ${runDir} — run init-run-record.mjs first`);
  process.exit(2);
}

const slug = slugArg || url.split("/").filter(Boolean).pop()?.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 80) || "pkg";

function loadJudgment() {
  return JSON.parse(readFileSync(judgmentPath, "utf8"));
}
function saveJudgment(j) {
  writeFileSync(judgmentPath, JSON.stringify(j, null, 2) + "\n");
}

// --- Re-implement analyzer regexes without importing TS (avoid tsx) ---
const CURL_PIPE_SHELL_RE =
  /(?:curl|wget)\b[^\n`]*?(https?:\/\/[^\s;|&"'`\)\]]+)[^\n`]*?\|[ \t]*(?:sudo[ \t]+)?(?:bash|sh)\b/i;
const SHELL_PROCESS_SUBST_RE =
  /(?:bash|sh)\s+<\(\s*(?:curl|wget)\b[^\n`]*?(https?:\/\/[^\s;|&"'`\)\]]+)/i;
const SHELL_C_CURL_RE =
  /(?:bash|sh)\s+-c\s+["']\s*\$\(\s*(?:curl|wget)\b[^\n`"']*?(https?:\/\/[^\s;|&"'`\)\]]+)/i;
const BARE_SCRIPT_URL_RE =
  /(?:^|[`\n(\s])((?:https?:\/\/)[^\s;|&"'`\)\]]+\/[^\s;|&"'`\)\]]+\.(?:sh|bash)(?:\?[^\s;|&"'`\)\]]*)?)/i;
const MARKDOWN_SCRIPT_LINK_RE =
  /\[[^\]]*\]\((https?:\/\/[^\s)]+\.(?:sh|bash)(?:\?[^\s)]*)?)\)/i;

function cleanScriptUrl(raw, requireScriptExt = false) {
  if (!raw) return null;
  let u = String(raw).trim().replace(/[),.;]+$/g, "").replace(/^['"]|['"]$/g, "");
  if (!/^https?:\/\//i.test(u)) return null;
  try {
    const parsed = new URL(u);
    if (/(?:^|\.)(?:shields\.io|badge(?:s)?\.[a-z0-9.-]+|img\.shields\.io)$/i.test(parsed.hostname)) return null;
    if (requireScriptExt && !/\.(?:sh|bash)$/i.test(parsed.pathname)) return null;
  } catch { return null; }
  return u;
}

function detectScriptInstall(text) {
  if (!text) return null;
  let m = text.match(CURL_PIPE_SHELL_RE);
  if (m?.[1]) {
    const u = cleanScriptUrl(m[1], false);
    if (u) return { method: "script", url: u, evidence: "curl|bash" };
  }
  m = text.match(SHELL_PROCESS_SUBST_RE);
  if (m?.[1]) {
    const u = cleanScriptUrl(m[1], false);
    if (u) return { method: "script", url: u, evidence: "process-subst" };
  }
  m = text.match(SHELL_C_CURL_RE);
  if (m?.[1]) {
    const u = cleanScriptUrl(m[1], false);
    if (u) return { method: "script", url: u, evidence: "sh -c curl" };
  }
  m = text.match(MARKDOWN_SCRIPT_LINK_RE);
  if (m?.[1]) {
    const u = cleanScriptUrl(m[1], true);
    if (u) return { method: "script", url: u, evidence: "markdown-link" };
  }
  m = text.match(BARE_SCRIPT_URL_RE);
  if (m?.[1]) {
    const u = cleanScriptUrl(m[1], true);
    if (u) return { method: "script", url: u, evidence: "bare-sh-url" };
  }
  return null;
}

async function renderWithWebView(targetUrl, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 35000;
  // @ts-ignore - Bun global
  const B = globalThis.Bun;
  if (!B || typeof B.WebView !== "function") return null;
  let view;
  try {
    try {
      view = new B.WebView({ width: 1280, height: 900, dataStore: "ephemeral", backend: "chrome" });
    } catch {
      view = new B.WebView({ width: 1280, height: 900, dataStore: "ephemeral" });
    }
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error(`WebView render timed out after ${timeoutMs}ms`)), timeoutMs));
    const work = (async () => {
      await view.navigate(targetUrl);
      // give JS hydration time (CMS/Gatsby/Next chunks)
      await B.sleep(2200);
      // extra wait for network idle-ish
      await B.sleep(800);
      // Prefer innerText for human-visible one-liners, fallback to outerHTML
      let renderedText = "";
      let renderedHtml = "";
      try {
        const t = await view.evaluate(`document.body ? document.body.innerText : ""`);
        renderedText = typeof t === "string" ? t : (t != null ? String(t) : "");
        // view.evaluate may return JSON string
        if (renderedText.startsWith('"') && renderedText.endsWith('"')) {
          try { renderedText = JSON.parse(renderedText); } catch {}
        }
      } catch {}
      try {
        const h = await view.evaluate(`document.documentElement ? document.documentElement.outerHTML : ""`);
        renderedHtml = typeof h === "string" ? h : (h != null ? String(h) : "");
        if (renderedHtml.startsWith('"') && renderedHtml.endsWith('"')) {
          try { renderedHtml = JSON.parse(renderedHtml); } catch {}
        }
      } catch {}
      // also collect <pre><code> blocks explicitly
      let codeText = "";
      try {
        const c = await view.evaluate(`Array.from(document.querySelectorAll("pre, code")).map(e=>e.textContent||"").join("\\n")`);
        let s = typeof c === "string" ? c : "";
        if (s.startsWith('"') && s.endsWith('"')) { try { s = JSON.parse(s); } catch {} }
        codeText = s;
      } catch {}
      return { renderedText, renderedHtml, codeText };
    })();
    const res = await Promise.race([work, timeout]);
    return res;
  } catch (e) {
    console.error(`WebView render failed: ${e?.message || e}`);
    return null;
  } finally {
    try { view?.close?.(); } catch {}
  }
}

async function fetchStatic(targetUrl) {
  try {
    const res = await fetch(targetUrl, {
      headers: { "User-Agent": "allbrew/render-judgment (Bun)" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.text();
    // strip script/style/tags like page-discover static path
    const text = body.replace(/<script[\s\S]*?<\/script>/gi, "\n").replace(/<style[\s\S]*?<\/style>/gi, "\n").replace(/<[^>]+>/g, "\n");
    return { renderedText: text, renderedHtml: body, codeText: "" };
  } catch (e) {
    console.error(`Static fetch failed: ${e?.message || e}`);
    return { renderedText: "", renderedHtml: "", codeText: "" };
  }
}

async function main() {
  const judgment = loadJudgment();
  const originalNotes = judgment.notes || "";

  let rendered = null;
  let mode = "static";
  // Try WebView first when available
  // @ts-ignore
  const webViewAvailable = typeof globalThis.Bun !== "undefined" && typeof globalThis.Bun.WebView === "function";
  if (webViewAvailable) {
    console.log(`WebView available — rendering ${url} with JS execution...`);
    rendered = await renderWithWebView(url);
    if (rendered && (rendered.renderedText || rendered.renderedHtml)) {
      mode = "webview";
      console.log(`WebView rendered: text ${rendered.renderedText.length} chars, html ${rendered.renderedHtml.length} chars`);
    } else {
      console.log("WebView render empty/null, falling back to static fetch");
      rendered = await fetchStatic(url);
      mode = "static-fallback";
    }
  } else {
    console.log("Bun.WebView not available (run under Bun with WebView build) — falling back to static fetch");
    rendered = await fetchStatic(url);
    mode = "static";
  }

  const combinedText = [rendered.renderedText, rendered.codeText, rendered.renderedHtml].filter(Boolean).join("\n");
  const scriptHit = detectScriptInstall(combinedText) || detectScriptInstall(rendered.renderedText) || detectScriptInstall(rendered.codeText);

  const host = (() => { try { return new URL(url).hostname; } catch { return null; } })();

  if (scriptHit?.url) {
    console.log(`bashinstall hit: ${scriptHit.evidence} → ${scriptHit.url} (mode=${mode})`);
    judgment.inputShape = {
      kind: "bash-script",
      host,
      owner: null,
      repo: null,
      hints: ["js-rendered" + (mode === "webview" ? "-webview" : "-static"), `bashinstall:${scriptHit.evidence}`, "render-judgment"],
    };
    judgment.expected = {
      strategy: "bash-script",
      generator: "install-script",
      packageName: scriptHit.url,
      formulaName: slug,
      binName: slug,
      service: false,
      serviceCommand: null,
      allbrewArgs: [],
      rationale: `Rendered page (mode=${mode}) contains bashinstall one-liner matching CURL_PIPE_SHELL_RE (${scriptHit.evidence}) → ${scriptHit.url}. Analyzer detectScriptInstall would yield method=script. Expected bash-script/install-script.`,
    };
    judgment.notes = [
      `render-judgment (${mode}): JS-executed render via ${webViewAvailable ? "Bun.WebView" : "static fetch"};`,
      `bashinstall pattern ${scriptHit.evidence} → ${scriptHit.url}`,
      originalNotes ? `prev: ${originalNotes}` : "",
    ].filter(Boolean).join(" ");
    // preserve deltas/proposedRule for later Phase 1.5
  } else {
    // No bashinstall — keep or set generic marketing/unknown note but mark that render was done
    const hint = `js-rendered-${mode} no-bashinstall`;
    console.log(`No bashinstall pattern found in rendered text (mode=${mode}, textLen=${rendered.renderedText.length})`);
    // Don't overwrite a user-set expected if --force not passed; just annotate
    if (hasFlag("--force") || !judgment.expected?.strategy) {
      // leave as null/unknown for manual fill, but record that we checked
      judgment.inputShape = {
        kind: judgment.inputShape?.kind || null,
        host: host || judgment.inputShape?.host || null,
        owner: judgment.inputShape?.owner || null,
        repo: judgment.inputShape?.repo || null,
        hints: [...(judgment.inputShape?.hints || []), hint, "render-judgment"].filter((v, i, a) => a.indexOf(v) === i),
      };
      judgment.notes = [`render-judgment (${mode}): no bashinstall pattern in rendered text (len ${rendered.renderedText.length}); static scaffold likely JS shell.`, originalNotes].filter(Boolean).join(" | ");
    } else {
      // just annotate hints/notes
      judgment.inputShape = judgment.inputShape || { kind: null, host, owner: null, repo: null, hints: [] };
      judgment.inputShape.hints = [...(judgment.inputShape.hints || []), hint, "render-judgment"].filter((v, i, a) => a.indexOf(v) === i);
      judgment.notes = [`render-judgment (${mode}): checked rendered text (len ${rendered.renderedText.length}) — no bashinstall; expected remains ${judgment.expected?.strategy || "null"}.`, originalNotes].filter(Boolean).join(" | ");
    }
  }

  // stash raw evidence lengths for debugging (not schema-critical)
  judgment._renderMeta = {
    mode,
    webViewAvailable,
    renderedTextLen: rendered.renderedText.length,
    renderedHtmlLen: rendered.renderedHtml.length,
    codeTextLen: rendered.codeText.length,
    scriptHit: scriptHit || null,
    at: new Date().toISOString(),
  };

  saveJudgment(judgment);
  console.log(`Updated ${judgmentPath} (mode=${mode}, hit=${scriptHit ? scriptHit.url : "none"})`);
}

await main();
