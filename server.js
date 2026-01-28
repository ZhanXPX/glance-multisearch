// server.js (Node.js >= 18)
const express = require("express");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");

const app = express();
app.use(express.json({ limit: "64kb" }));

const DATA_DIR = path.join(__dirname, "data");
const STORE_PATH = path.join(DATA_DIR, "history.json");

// --- persistent store (file-based) ---
function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) fs.writeFileSync(STORE_PATH, JSON.stringify({ version: 1, users: {} }, null, 2));
}
ensureStore();

let store = null;
let writeTimer = null;

async function loadStore() {
  if (store) return store;
  const raw = await fsp.readFile(STORE_PATH, "utf-8");
  store = JSON.parse(raw);
  if (!store.users) store.users = {};
  return store;
}
function scheduleFlush() {
  if (writeTimer) return;
  writeTimer = setTimeout(async () => {
    writeTimer = null;
    try {
      await fsp.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
    } catch (e) {
      console.error("Failed to write store:", e);
    }
  }, 150);
}

function normUser(u) {
  const s = (u || "default").toString().trim() || "default";
  // keep simple & safe
  return s.slice(0, 40).replace(/[^\w\-\.@]/g, "_");
}
function normQ(q) {
  return (q || "").toString().trim().slice(0, 200);
}

const MAX_HISTORY = 1000;

// --- history APIs ---
app.get("/api/history", async (req, res) => {
  const u = normUser(req.query.u);
  const db = await loadStore();
  const list = db.users[u] || [];
  res.json({ user: u, items: list.slice(0, 50) }); // return latest 50
});

app.post("/api/history", async (req, res) => {
  const u = normUser(req.body.u);
  const q = normQ(req.body.q);
  const engine = (req.body.engine || "").toString().slice(0, 32);

  if (!q) return res.status(400).json({ error: "Empty query" });

  const db = await loadStore();
  const list = db.users[u] || [];
  const now = Date.now();

  // de-dup by query (move to top)
  const filtered = list.filter(x => x && x.q !== q);
  filtered.unshift({ q, engine, ts: now });
  db.users[u] = filtered.slice(0, MAX_HISTORY);

  scheduleFlush();
  res.json({ ok: true });
});

app.delete("/api/history", async (req, res) => {
  const u = normUser(req.query.u);
  const db = await loadStore();
  db.users[u] = [];
  scheduleFlush();
  res.json({ ok: true });
});

// --- suggestions (server-side proxy, avoids CORS) ---
async function fetchWithTimeout(url, ms = 1500, headers = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  } finally {
    clearTimeout(t);
  }
}

async function suggestGoogle(q) {
  // returns: ["q", ["a","b"...], ...]
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`;
  const r = await fetchWithTimeout(url);
  const j = await r.json();
  return Array.isArray(j?.[1]) ? j[1] : [];
}

async function suggestBing(q) {
  // returns: ["q", ["a","b"...]]
  const url = `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(q)}`;
  const r = await fetchWithTimeout(url);
  const j = await r.json();
  return Array.isArray(j?.[1]) ? j[1] : [];
}

async function suggestDuck(q) {
  // returns: [{phrase:"..."}]
  const url = `https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list`;
  const r = await fetchWithTimeout(url);
  const j = await r.json();
  return (Array.isArray(j) ? j.map(x => x?.phrase).filter(Boolean) : []);
}

async function suggestBaidu(q) {
  // JSONP: window.baidu.sug({... s:[...] ...})
  const cb = "cb";
  const url = `https://suggestion.baidu.com/su?wd=${encodeURIComponent(q)}&cb=${cb}`;
  const r = await fetchWithTimeout(url, 1500, { "User-Agent": "Mozilla/5.0" });
  const text = await r.text();
  // extract inside cb(...)
  const m = text.match(/^cb\((.*)\)\s*$/);
  if (!m) return [];
  try {
    const obj = JSON.parse(m[1]);
    return Array.isArray(obj?.s) ? obj.s : [];
  } catch {
    return [];
  }
}

function uniqueLimit(arr, n = 10) {
  const out = [];
  const seen = new Set();
  for (const s of arr) {
    const t = (s || "").toString().trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= n) break;
  }
  return out;
}

app.get("/api/suggest", async (req, res) => {
  const u = normUser(req.query.u);
  const engine = (req.query.engine || "google").toString();
  const q = normQ(req.query.q);

  if (!q) return res.json({ suggestions: [], from: engine });

  // history match first (server-side) so it also works cross-device
  const db = await loadStore();
  const history = (db.users[u] || [])
    .map(x => x?.q)
    .filter(Boolean);

  const hMatch = history
    .filter(x => x.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 6);

  let remote = [];
  try {
    if (engine === "google") remote = await suggestGoogle(q);
    else if (engine === "bing") remote = await suggestBing(q);
    else if (engine === "baidu") remote = await suggestBaidu(q);
    else if (engine === "duck") remote = await suggestDuck(q);
    else {
      // fallback: use google
      remote = await suggestGoogle(q);
    }
  } catch {
    remote = [];
  }

  const merged = uniqueLimit([...remote, ...hMatch], 12);
  res.json({ suggestions: merged, from: engine });
});

// --- static site ---
app.use("/", express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MultiSearch running on http://127.0.0.1:${PORT}`);
  console.log(`History stored at: ${STORE_PATH}`);
});

