#!/usr/bin/env node
/**
 * add-to-queue.mjs — enqueue URLs to tests/monitored-install-batch/state/agent-queue.json
 *
 * Usage:
 *   node .agents/skills/add-test-case-with-queue/add-to-queue.mjs --urls "https://github.com/... ,https://.../install.sh" [--dry-run] [--queue <path>]
 *   node .agents/skills/add-test-case-with-queue/add-to-queue.mjs --url "https://..." [--dry-run]
 *
 * Derives slug/source/agentName, dedupes, sets idx = max+1, status pending.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const DEFAULT_QUEUE = resolve(REPO_ROOT, "tests/monitored-install-batch/state/agent-queue.json");

function arg(flag, fallback=null){
  const i = process.argv.indexOf(flag);
  if(i===-1) return fallback;
  return process.argv[i+1] ?? fallback;
}
function has(flag){ return process.argv.includes(flag); }

function slugify(url, idx){
  // For GitHub repos, use repo name as slug (not owner-repo)
  try{
    const parsed = new URL(url);
    if(parsed.hostname==="github.com"){
      const parts = parsed.pathname.split("/").filter(Boolean);
      if(parts.length>=2) return parts[1].toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,40) || `pkg-${idx}`;
    }
  }catch{}
  const u = String(url||"").toLowerCase().replace(/^https?:\/\//,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,50) || `pkg-${idx}`;
  // shorten common prefixes
  return u.replace(/^github-com-/,"").replace(/^www-/,"").slice(0,40);
}
function sourceFor(url){
  const l = url.toLowerCase();
  if(l.includes("github.com/")) return "in_github";
  if(l.endsWith(".sh") || l.includes("/install") || l.includes("ante.run")) return "script_install";
  if(l.includes("crates.io")||l.includes("cargo")) return "in_cargo";
  if(l.includes("npmjs.com")) return "in_npm";
  if(l.includes("pypi.org")) return "in_pip";
  if(l.includes("antigma.ai")||l.includes("docs.antigma")) return "in_dev_website";
  return "in_dev_website";
}
function nameFor(url, slug){
  // prefer last path component or host
  try{
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if(parts.length) return parts[parts.length-1].replace(/\?.*/,"").slice(0,30) || slug;
    return u.hostname.replace(/^www\./,"").slice(0,30);
  }catch{ return slug; }
}

const queuePath = resolve(arg("--queue", DEFAULT_QUEUE));
const dryRun = has("--dry-run");
let urls = [];
if(arg("--urls")) urls = arg("--urls").split(",").map(s=>s.trim()).filter(Boolean);
if(arg("--url")) urls.push(arg("--url").trim());
if(!urls.length){
  console.error("Provide --urls \"a,b\" or --url \"...\"");
  process.exit(2);
}
// canonicalize: strip utm params, trailing slash
urls = urls.map(u=>{
  try{
    const parsed = new URL(u);
    // strip utm_* and similar tracking
    for(const k of [...parsed.searchParams.keys()]) if(k.startsWith("utm_")) parsed.searchParams.delete(k);
    // remove empty search
    if([...parsed.searchParams.keys()].length===0) parsed.search="";
    let s = parsed.toString();
    if(s.endsWith("/") && parsed.pathname!="/") s=s.slice(0,-1);
    return s;
  }catch{ return u; }
});

let queue;
if(existsSync(queuePath)){
  queue = JSON.parse(readFileSync(queuePath,"utf8"));
} else {
  queue = { total:0, updatedAt: new Date().toISOString(), items:[] };
}
if(!Array.isArray(queue.items)) queue.items = [];
const existingUrls = new Set(queue.items.map(it=>it.url));
const existingSlugs = new Set(queue.items.map(it=>it.slug));
let maxIdx = queue.items.reduce((m,it)=>Math.max(m, it.idx ?? -1), -1);
const toAdd = [];
for(const url of urls){
  if(existingUrls.has(url)){
    console.log(`skip duplicate url: ${url}`);
    continue;
  }
  const baseSlug = slugify(url, maxIdx+1+toAdd.length);
  // ensure slug unique: ante -> ante-1 for second variant
  let slug = baseSlug;
  let n=1;
  while(existingSlugs.has(slug)){
    slug = `${baseSlug}-${n++}`;
  }
  // special: for ante.run/install.sh keep readable
  if(url.includes("ante.run")) slug = existingSlugs.has("ante-install-sh") ? `ante-install-sh-${n}` : "ante-install-sh";
  if(url.includes("antigma.ai") && !url.includes("docs")) slug = existingSlugs.has("ante-homepage") ? `ante-homepage-${n}` : "ante-homepage";
  const name = url.includes("github.com/AntigmaLabs/ante") ? "ante" : nameFor(url, slug);
  const idx = ++maxIdx;
  const entry = {
    idx,
    name,
    url,
    source: sourceFor(url),
    slug,
    agentName: `url-${String(idx).padStart(4,"0")}-${slug}`,
    status: "pending"
  };
  toAdd.push(entry);
  existingSlugs.add(slug);
  existingUrls.add(url);
}

if(!toAdd.length){
  console.log("Nothing to add.");
  process.exit(0);
}
console.log(`Would add ${toAdd.length} queue entries:`);
for(const e of toAdd) console.log(`  idx ${e.idx} slug ${e.slug} source ${e.source} url ${e.url}`);

if(dryRun){
  console.log("(dry-run — not written)");
  process.exit(0);
}

mkdirSync(dirname(queuePath), { recursive:true });
queue.items.push(...toAdd);
queue.total = queue.items.length;
queue.updatedAt = new Date().toISOString();
writeFileSync(queuePath, JSON.stringify(queue,null,2)+"\n");
console.log(`Wrote ${queuePath} total ${queue.total}`);
