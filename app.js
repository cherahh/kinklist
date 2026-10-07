
//   refresh wipes your answers probably change that idk
//   links are position based
const R = ["Favorite", "Like", "Interested", "Maybe", "No"];
const N = KINKS.length;
// stored as index+1 so 0 is free for unrated
// maybe doesn't count as "into it", two maybes isn't really a match
const into = v => v >= 1 && v <= 3;

let mine = new Uint8Array(N), theirs = null;
let mode = "edit"; // edit | view | compare
let q = "", filt = "all";

const $ = id => document.getElementById(id);
const rows = [], secs = [];

// ---------- link ----------
// 3 bits per answer, 6 states fit, 255 items comes out around 128 chars

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

function dec(str) {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64); // throws on garbage, fromHash catches it
  const arr = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    let v = 0;
    for (let b = 0; b < 3; b++) {
      const p = i * 3 + b;
      if ((p >> 3) < bin.length && (bin.charCodeAt(p >> 3) >> (p & 7)) & 1) v |= 1 << b;
    }
    // 6 and 7  never come out of enc(), only out of a link that got mangled in a chat app
    // 67
    arr[i] = v <= 5 ? v : 0;
  }
  return arr;
}

function fromHash() {
  const h = location.hash.slice(1);
  if (!h) return null;
  const dot = h.indexOf(".");
  if (h.slice(0, dot) !== "v1") return "bad";
  try { return dec(h.substring(dot + 1)); } catch { return "bad"; }
}

// ---------- list ----------

function build() {
  let sec;
  KINKS.forEach(([name, letter, desc], i) => {
    if (!sec || sec.dataset.l !== letter) {
      sec = document.createElement("section");
      sec.className = "sec";
      sec.dataset.l = letter;
      sec.innerHTML = "<h2></h2>";
      sec.firstChild.textContent = letter;
      $("list").appendChild(sec);
      secs.push(sec);
      // buttons, not <a href="#A">, an anchor would stomp the share data sitting in the hash
      const b = document.createElement("button");
      b.textContent = letter;
      b.onclick = () => sec.scrollIntoView({ behavior: "smooth" });
      $("az").appendChild(b);
      sec._az = b;
    }

    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML =
      '<button class="nm"></button>' +
      '<div class="right"><div class="them" hidden>Them <span class="badge"></span></div><div class="rates"></div></div>' +
      '<p class="desc" hidden></p>';
    const nm = row.querySelector(".nm"), d = row.querySelector(".desc");
    nm.textContent = name;
    d.textContent = desc || "No description given.";
    nm.onclick = () => { d.hidden = !d.hidden; row.classList.toggle("open", !d.hidden); };

    const rates = row.querySelector(".rates");
    R.forEach((label, k) => {
      const b = document.createElement("button");
      b.className = "r" + (k + 1);
      b.textContent = label;
      b.onclick = () => rate(i, k + 1);
      rates.appendChild(b);
    });

    sec.appendChild(row);
    rows.push({ row, sec, rates, hay: (name + " " + desc).toLowerCase(), btns: [...rates.children], them: rates.previousSibling, badge: row.querySelector(".badge") });
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
  r.btns.forEach((b, k) => b.classList.toggle("on", mine[i] === k + 1));
  r.rates.hidden = mode === "view";
  r.them.hidden = mode === "edit";
  if (theirs) {
    const t = theirs[i];
    r.badge.className = "badge" + (t ? " r" + t : "");
    r.badge.textContent = t ? R[t - 1] : "unrated";
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
  secs.forEach(s => { s.hidden = !live.has(s); s._az.disabled = s.hidden; });
  $("empty").hidden = live.size > 0;
}

function chips() {
  const n = [0, 0, 0, 0, 0, 0];
  (mode === "view" ? theirs : mine).forEach(v => n[v]++);
  const opts = [["all", "All", N], ["unrated", "Unrated", n[0]], ...R.map((l, k) => [String(k + 1), l, n[k + 1]])];
  if (mode === "compare") {
    const m = { both: 0, clash: 0, "": 0 };
    for (let i = 0; i < N; i++) m[pair(i)]++;
    opts.push(["both", "Both into", m.both], ["clash", "Clash", m.clash]);
  }
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

  const done = N - n[0];
  $("sub").textContent = mode === "view" ? `${done} of ${N} rated by them` : `${done} of ${N} rated. Tap a name for what it means.`;
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
  for (let i = 0; i < N; i++) paint(i);
  chips();
  refilter();
}

function load() {
  const t = fromHash();
  // console.log("hash ->", t === "bad" || !t ? t : enc(t));
  if (t === "bad") {
    theirs = null;
    setMode("edit");
    // reuse the shared link banner instead of building a whole separate error box
    $("banner").hidden = false;
    $("compare").hidden = true;
    $("bannerText").textContent = "That link looks cut off or broken, so here's a blank list instead.";
    $("own").textContent = "Ok";
    return;
  }
  theirs = t;
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
let armed = 0;
$("clear").onclick = e => {
  const b = e.currentTarget;
  const disarm = () => { clearTimeout(armed); armed = 0; b.textContent = "Clear"; b.classList.remove("warn"); };
  if (!armed) {
    b.textContent = "Sure? Click again";
    b.classList.add("warn");
    armed = setTimeout(disarm, 3000);
    return;
  }
  disarm();
  mine = new Uint8Array(N);
  setMode(mode);
};

$("share").onclick = () => {
  $("link").value = location.href.split("#")[0] + "#v1." + enc(mine);
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
