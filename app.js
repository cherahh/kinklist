
//   refresh wipes your answers probably change that idk
//   links are position based
//   mine/theirs hold both tabs in one array, main list first then taboo from N on

// [stored value, label] in the order the buttons show up

const R = [[1, "Favorite"], [2, "Like"], [3, "Interested"], [4, "Maybe"], [5, "No"]];
const NAME = Object.fromEntries(R);
const N = KINKS.length, T = TABOO.length;
// stored as 1..5 so 0 is free for unrated
// maybe doesn't count as "into it", two maybes isn't really a match
const into = v => v >= 1 && v <= 3;

let mine = new Uint8Array(N + T), theirs = null;
let mode = "edit"; // edit | view | compare
let tab = "all";   // all | taboo
let q = "", filt = "all";

const $ = id => document.getElementById(id);
const rows = [], secs = [];

// ---------- link ----------
// 3 bits per answer, 7 states fit, 255 items comes out around 128 chars
// format: #v1.<main>.<taboo>.t   taboo segment and .t only show up when needed,
// .t = sharer was on the taboo tab so open there

function enc(arr) {
  const out = new Uint8Array(Math.ceil(arr.length * 3 / 8));
  arr.forEach((v, i) => {
    for (let b = 0; b < 3; b++) if ((v >> b) & 1) {
      const p = i * 3 + b;
      out[p >> 3] |= 1 << (p & 7);
    }
  });
  // unrated stuff at the end is all zero bytes, no point putting it in the link
  let end = out.length;
  while (end && !out[end - 1]) end--;
  let s = "";
  for (let i = 0; i < end; i++) s += String.fromCharCode(out[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function dec(str, len) {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64); // throws on garbage, fromHash catches it
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    let v = 0;
    for (let b = 0; b < 3; b++) {
      const p = i * 3 + b;
      if ((p >> 3) < bin.length && (bin.charCodeAt(p >> 3) >> (p & 7)) & 1) v |= 1 << b;
    }
    // 6 = old don't care links, 7 = a link that got mangled in a chat app, both end up unrated
    arr[i] = v <= 5 ? v : 0;
  }
  return arr;
}

function link() {
  const a = enc(mine.subarray(0, N)), b = enc(mine.subarray(N));
  let h = "v1." + a;
  if (b || tab === "taboo") h += "." + b;
  if (tab === "taboo") h += ".t";
  return location.href.split("#")[0] + "#" + h;
}

// takes a string so tests don't have to touch location.hash, chrome starts ignoring
// hash changes after ~200 in a few seconds and the old test loop ran straight into that
function fromHash(h = location.hash.slice(1)) {
  if (!h) return null;
  const [ver, a = "", b = "", flag, ...extra] = h.split(".");
  if (ver !== "v1" || extra.length || (flag !== undefined && flag !== "t")) return "bad";
  try {
    const ans = new Uint8Array(N + T);
    ans.set(dec(a, N));
    ans.set(dec(b, T), N);
    return { ans, tab: flag ? "taboo" : "all" };
  } catch { return "bad"; }
}

// ---------- list ----------

function row(name, desc, safe, i, t, sec) {
  const el = document.createElement("div");
  el.className = "row";
  el.innerHTML =
    '<button class="nm"></button>' +
    '<div class="right"><div class="them" hidden>Them <span class="badge"></span></div><div class="rates"></div></div>' +
    '<p class="desc" hidden></p>';
  const nm = el.querySelector(".nm"), d = el.querySelector(".desc");
  nm.textContent = name;
  d.textContent = desc || "No description given.";
  if (safe) {
    const s = document.createElement("span");
    s.className = "safe";
    s.innerHTML = "<b>Safety</b> ";
    s.append(safe);
    d.appendChild(s);
  }
  nm.onclick = () => { d.hidden = !d.hidden; el.classList.toggle("open", !d.hidden); };

  const rates = el.querySelector(".rates");
  for (const [v, label] of R) {
    const b = document.createElement("button");
    b.className = "r" + v;
    b.textContent = label;
    b.onclick = () => rate(i, v);
    rates.appendChild(b);
  }

  sec.appendChild(el);
  // rows[i] not push, taboo gets built in display order which isn't storage order
  rows[i] = { row: el, sec, tab: t, rates, hay: (name + " " + desc).toLowerCase(), btns: [...rates.children], them: rates.previousSibling, badge: el.querySelector(".badge") };
}

function section(title, t) {
  const sec = document.createElement("section");
  sec.className = "sec";
  sec.dataset.l = title;
  sec.dataset.tab = t;
  sec.innerHTML = "<h2></h2>";
  sec.firstChild.textContent = title;
  $("list").appendChild(sec);
  secs.push(sec);
  // buttons, not <a href="#A">, an anchor would stomp the share data sitting in the hash
  const b = document.createElement("button");
  b.textContent = title;
  b.dataset.tab = t;
  b.onclick = () => sec.scrollIntoView({ behavior: "smooth" });
  $("az").appendChild(b);
  sec._az = b;
  return sec;
}

function build() {
  // taboo is shown alphabetical like the main list, but the index (= link position)
  // stays whatever order taboo.js has, so new entries can go anywhere in the display
  const all = KINKS.map(([name, letter, desc], i) => [name, letter, desc, null, i, "all"]);
  const taboo = TABOO.map(([name, desc, safe], k) => [name, name[0].toUpperCase(), desc, safe, N + k, "taboo"])
    .sort((a, b) => a[0].localeCompare(b[0]));
  let sec;
  for (const [name, letter, desc, safe, i, t] of [...all, ...taboo]) {
    if (!sec || sec.dataset.l !== letter || sec.dataset.tab !== t) sec = section(letter, t);
    row(name, desc, safe, i, t, sec);
  }

  $("tabs").querySelectorAll("button").forEach(b => {
    b.querySelector("b").textContent = b.dataset.tab === "taboo" ? T : N;
    b.onclick = () => setTab(b.dataset.tab);
  });
}

function rate(i, v) {
  if (mode === "view") return;
  mine[i] = mine[i] === v ? 0 : v; // clicking the lit one again clears it
  paint(i);
  chips();
}

function paint(i) {
  const r = rows[i];
  const v = (mode === "view" ? theirs : mine)[i];
  r.row.className = "row" + (r.row.classList.contains("open") ? " open" : "") + (v ? " v" + v : "");
  r.btns.forEach((b, k) => b.classList.toggle("on", mine[i] === R[k][0]));
  r.rates.hidden = mode === "view";
  r.them.hidden = mode === "edit";
  if (theirs) {
    const t = theirs[i];
    r.badge.className = "badge" + (t ? " r" + t : "");
    r.badge.textContent = t ? NAME[t] : "unrated";
    // in view mode the badge is alone on the right, "Them" there is just noise
    r.them.firstChild.textContent = mode === "compare" ? "Them " : "";
  }
  if (mode === "compare") r.row.classList.toggle("match", pair(i) === "both");
}

// both into it, or one into it while the other said no. used to be pasted into
// keep() and chips() separately, merged so the two counts can't disagree
function pair(i) {
  const a = mine[i], b = theirs[i];
  if (into(a) && into(b)) return "both";
  if ((into(a) && b === 5) || (a === 5 && into(b))) return "clash";
  return "";
}

function keep(i) {
  if (rows[i].tab !== tab) return false;
  if (q && !rows[i].hay.includes(q)) return false;
  const v = (mode === "view" ? theirs : mine)[i];
  if (filt === "all") return true;
  if (filt === "unrated") return !v;
  if (filt === "both" || filt === "clash") return pair(i) === filt;
  return v === +filt;
}

function refilter() {
  const live = new Set();
  rows.forEach((r, i) => {
    r.row.hidden = !keep(i);
    if (!r.row.hidden) live.add(r.sec);
  });
  secs.forEach(s => {
    s.hidden = !live.has(s);
    s._az.disabled = s.hidden;
  });
  $("empty").hidden = live.size > 0;
}

function chips() {
  const src = mode === "view" ? theirs : mine;
  const n = [0, 0, 0, 0, 0, 0];
  let total = 0;
  const m = { both: 0, clash: 0, "": 0 };
  rows.forEach((r, i) => {
    if (r.tab !== tab) return;
    total++;
    n[src[i]]++;
    if (mode === "compare") m[pair(i)]++;
  });
  const opts = [["all", "All", total], ["unrated", "Unrated", n[0]], ...R.map(([v, l]) => [String(v), l, n[v]])];
  if (mode === "compare") opts.push(["both", "Both into", m.both], ["clash", "Clash", m.clash]);
  // leaving compare while "clash" is picked would otherwise filter on a chip that no longer exists
  if (!opts.some(o => o[0] === filt)) filt = "all";

  const box = $("chips");
  box.innerHTML = "";
  for (const [k, label, count] of opts) {
    const c = document.createElement("button");
    c.className = "chip" + (k === filt ? " on" : "");
    c.innerHTML = (+k ? `<span class="dot" style="background:var(--r${k})"></span>` : "") + `<span></span><b>${count}</b>`;
    c.querySelector("span:not(.dot)").textContent = label;
    c.onclick = () => { filt = k; chips(); refilter(); };
    box.appendChild(c);
  }

  const done = total - n[0];
  $("sub").textContent = mode === "view" ? `${done} of ${total} rated by them` : `${done} of ${total} rated. Tap a name for what it means.`;
}

function setTab(t) {
  tab = t;
  $("tabs").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  // one letter bar, each tab only shows its own letters
  for (const b of $("az").children) b.hidden = b.dataset.tab !== t;
  chips();
  refilter();
}

function setMode(m) {
  mode = m;
  const view = mode === "view";
  $("banner").hidden = mode === "edit";
  $("compare").hidden = !view;
  $("share").hidden = view;  $("clear").hidden = view;
  $("own").textContent = mode === "compare" ? "Stop comparing" : "Start my own list";
  $("bannerText").textContent = view
    ? "You're looking at someone's shared list. It's read only."
    : "Comparing: your answers on the buttons, theirs on the badge. Names in pink are things you're both into.";
  for (let i = 0; i < N + T; i++) paint(i);
  setTab(tab);
}

function load() {
  const t = fromHash();
  // console.log("hash ->", t);
  if (t === "bad") {
    theirs = null;
    tab = "all";
    setMode("edit");
    // reuse the shared link banner instead of building a whole separate error box
    $("banner").hidden = false;
    $("compare").hidden = true;
    $("bannerText").textContent = "That link looks cut off or broken, so here's a blank list instead.";
    $("own").textContent = "Ok";
    return;
  }
  theirs = t && t.ans;
  if (t) tab = t.tab;
  setMode(t ? "view" : "edit");
}

// ---------- buttons ----------

$("compare").onclick = () => { filt = "all"; setMode("compare"); scrollTo({ top: 0 }); };

$("own").onclick = () => {
  if (mode === "compare") return setMode("view");
  // replaceState so back doesn't bounce you straight into their list again
  history.replaceState(null, "", location.pathname + location.search);
  theirs = null;
  setMode("edit");
};

$("q").oninput = e => { q = e.target.value.trim().toLowerCase(); refilter(); };

// two click clear, there's no autosave so one misclick would wipe the whole list for good
// wipes both tabs, clearing just the visible one felt like it'd leave people confused about what's left
let armed = 0;
$("clear").onclick = e => {
  const b = e.currentTarget;
  const disarm = () => { clearTimeout(armed); armed = 0; b.textContent = "Clear"; b.classList.remove("warn"); };
  if (!armed) {
    b.textContent = "Sure? Clears both tabs";
    b.classList.add("warn");
    armed = setTimeout(disarm, 3000);
    return;
  }
  disarm();
  mine = new Uint8Array(N + T);
  setMode(mode);
};

$("share").onclick = () => {
  $("link").value = link();
  $("copied").innerHTML = "&nbsp;";
  $("dlg").showModal();
  $("link").select();
};

$("copy").onclick = () => {
  const inp = $("link");
  const ok = () => ($("copied").textContent = "Copied.");
  // execCommand is deprecated but it's the only thing that works when clipboard api is blocked on file://
  const old = () => { inp.select(); document.execCommand("copy") && ok(); };
  navigator.clipboard ? navigator.clipboard.writeText(inp.value).then(ok, old) : old();
};

// someone pasting a different link into the same tab
addEventListener("hashchange", load);

build();
load();
