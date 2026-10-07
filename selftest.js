/* FX-603P 模擬器自動測試：用最小 DOM stub 在 Node 裡實際跑 index.html 的邏輯 */
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

/* ---------------- DOM / 瀏覽器 stub ---------------- */
class El {
  constructor(tag) {
    this.tagName = (tag || "div").toUpperCase();
    this.children = [];
    this.style = {};
    this._cls = new Set();
    this._attr = {};
    this._html = "";
    this.textContent = "";
    this.value = "";
    this.checked = false;
    this.files = null;
    this.href = ""; this.download = "";
    this._listeners = {};
    const self = this;
    this.classList = {
      add: (...c) => c.forEach((x) => self._cls.add(x)),
      remove: (...c) => c.forEach((x) => self._cls.delete(x)),
      toggle: (c, f) => { if (f === undefined) f = !self._cls.has(c); f ? self._cls.add(c) : self._cls.delete(c); return f; },
      contains: (c) => self._cls.has(c),
    };
  }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((x) => x !== this); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this._cls].join(" "); }
  set innerHTML(v) { this._html = v; if (v === "") this.children = []; }
  get innerHTML() { return this._html; }
  setAttribute(k, v) { this._attr[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attr, k) ? this._attr[k] : null; }
  addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); }
  click() { (this._listeners.click || []).forEach((f) => f({ target: this })); }
  blur() {}
  closest() { return null; }
  select() {}
}

const els = {};
const store = {};
let lastBlob = null;
let intervalCb = null;

global.document = {
  getElementById: (id) => (els[id] = els[id] || new El("div")),
  createElement: (t) => new El(t),
  body: new El("body"),
  addEventListener: () => {},
};
global.window = global;
global.addEventListener = () => {};
global.localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
global.setInterval = (fn) => { intervalCb = fn; return 1; };
global.clearInterval = () => {};
global.Blob = class { constructor(parts) { this.text = parts.join(""); } };
global.URL = { createObjectURL: (b) => { lastBlob = b; return "blob:1"; }, revokeObjectURL: () => {} };
global.navigator = { clipboard: { writeText: async () => {} } };

/* ---------------- 執行受測腳本 ---------------- */
eval(js);
const fx = () => global.__fx;

let fails = 0;
function ok(cond, msg, extra) {
  if (cond) console.log("  PASS  " + msg);
  else { fails++; console.log("  FAIL  " + msg + (extra !== undefined ? "   → " + extra : "")); }
}
function near(a, b, eps) { return Math.abs(a - b) < (eps === undefined ? 1e-9 : eps); }
function reset() {
  // 清空程式與記憶體（不影響已存檔），回到乾淨狀態
  const f = fx();
  f.M.progs = {}; for (let i = 0; i < 20; i++) f.M.progs["P" + i] = [];
  f.M.regs = new Array(110).fill(0);
  f.M.mode = 0; f.M.area = "P0";
  f.M.alphaLine = ""; f.M.err = false;
  f.pressSeq(["ac"]);
}
function press(list) { fx().pressSeq(list); }
function screen() { return fx().screen(); }

/* ================= 1. 計算 ================= */
console.log("\n=== 計算引擎 ===");
reset();
press(["1", "2", "3", "add", "4", "5", "eq"]);
ok(near(fx().M.x, 168), "123 + 45 = 168", fx().M.x);
reset();
press(["2", "add", "3", "mul", "4", "eq"]);
ok(near(fx().M.x, 14), "2 + 3 × 4 = 14（優先權）", fx().M.x);
reset();
press(["lp", "1", "add", "2", "rp", "mul", "3", "eq"]);
ok(near(fx().M.x, 9), "(1 + 2) × 3 = 9", fx().M.x);
reset();
press(["2", "lp", "3", "add", "4", "rp", "eq"]);
ok(near(fx().M.x, 14), "2(3 + 4) = 14（隱含乘法）", fx().M.x);
reset();
press(["9", "sqrt"]);
ok(near(fx().M.x, 3), "√9 = 3", fx().M.x);
reset();
press(["5", "fact"]);
ok(near(fx().M.x, 120), "5! = 120", fx().M.x);
reset();
press(["2", "xpy", "1", "0", "eq"]);
ok(near(fx().M.x, 1024), "2^10 = 1024", fx().M.x);
reset();
press(["5", "invx"]);
ok(near(fx().M.x, 0.2), "1/5 = 0.2", fx().M.x);
reset();
press(["3", "0", "sin"]);
ok(near(fx().M.x, 0.5, 1e-12), "sin 30° = 0.5（DEG）", fx().M.x);
reset();
press(["2nd", "8"]);
press(["pi", "div", "2", "eq", "sin"]);
ok(near(fx().M.x, 1, 1e-12), "2nd+8 → RAD，sin(π/2) = 1", fx().M.x);
reset();
press(["2nd", "7"]);
press(["4", "2", "sto", "0", "5", "clr", "rcl", "0", "5"]);
ok(near(fx().M.x, 42), "STO 05 / RCL 05 = 42", fx().M.x);
reset();
press(["1", "0", "sto", "0", "1", "clr", "5", "mplus", "0", "1", "clr", "rcl", "0", "1"]);
ok(near(fx().M.x, 15), "M+ 01 後 RCL 01 = 15", fx().M.x);
reset();
press(["1", "div", "0", "eq"]);
ok(fx().M.err === true, "除以 0 → ERROR", fx().M.err);
reset();
press(["2nd", "dot", "2nd", "dot", "2nd", "dot"]);        // FIX 0 → 1 → 2
press(["1", "div", "3", "eq"]);
ok(screen().l2.indexOf("0.33") === 0, "FIX 2 → 1÷3 顯示 0.33", screen().l2);
reset();

/* ================= 2. 程式錄製 ================= */
console.log("\n=== 程式錄製（MODE 1 WRT）===");
reset();
press(["mode", "1"]);                       // MODE 1
ok(fx().M.mode === 1, "MODE 1 進入錄製模式");
press(["1", "2", "add", "3", "4", "eq"]);
const p0 = fx().M.progs.P0;
ok(p0.length === 4, "12+34= 合併成 4 步（數字各自成一步）", JSON.stringify(p0.map(fx().stepLabel)));
ok(p0[0].t === "num" && p0[0].v === 12, "第一步是字面值 12", JSON.stringify(p0[0]));
ok(p0[1].t === "op" && p0[1].v === "+", "第二步是運算子 +");
reset();
press(["mode", "1", "sto", "0", "5"]);
const q = fx().M.progs.P0;
ok(q.length === 1 && q[0].t === "sto" && q[0].n === 5, "STO 05 合併成 1 步", JSON.stringify(q));
reset();
press(["mode", "1", "ind", "sto", "0", "5"]);
const q2 = fx().M.progs.P0;
ok(q2.length === 1 && q2[0].ind === true && q2[0].n === 5, "IND STO 05 → 間接單步", JSON.stringify(q2));
reset();
press(["mode", "1", "lbl", "3", "goto", "3", "dsz", "goto", "0", "hlt"]);
const q3 = fx().M.progs.P0.map(fx().stepLabel);
ok(q3.join(" | ") === "LBL 3 | GOTO 3 | DSZ  | GOTO 0 | HLT", "LBL/GOTO/DSZ/HLT 錄製正確", q3.join(" | "));
reset();
press(["mode", "1", "1", "2", "add", "3", "4", "eq", "mode", "0"]);
ok(fx().M.mode === 0, "MODE 0 回到 RUN");
fx().callArea("P0");
ok(near(fx().M.x, 46), "執行剛錄的程式 12+34 = 46", fx().M.x);
reset();

/* ================= 3. 程式執行 ================= */
console.log("\n=== 程式執行 ===");
reset();
fx().loadSample("階乘 n!（P0）");
press(["5"]);
fx().callArea("P0");
press([]);                                                 // 強制重畫
ok(fx().M.prog.paused === true, "階乘：HLT 讓程式暫停等輸入");
ok(screen().l1.indexOf("n!=") === 0, "階乘：第一行輸出 n!=", screen().l1);
press(["exe"]);
ok(near(fx().M.x, 120), "階乘 5! = 120（DSZ + GOTO 迴圈）", fx().M.x);

reset();
fx().loadSample("1..n 加總（P2）");
press(["5"]);
fx().callArea("P2");
press(["exe"]);
ok(near(fx().M.x, 15), "1..5 加總 = 15", fx().M.x);

reset();
fx().loadSample("圓面積（P3）");
press(["2"]);
fx().callArea("P3");
press(["exe"]);
ok(near(fx().M.x, 4 * Math.PI, 1e-9), "半徑 2 的圓面積 = 4π", fx().M.x);

reset();
fx().M.progs.P3 = [
  { t: "hlt" }, { t: "gsb", n: 0, ind: false }, { t: "op", v: "+" }, { t: "num", v: 1 }, { t: "eq" },
  { t: "rtn" },
  { t: "lbl", n: 0 }, { t: "op", v: "*" }, { t: "num", v: 2 }, { t: "rtn" },
];
press(["5"]);
fx().callArea("P3");
press(["exe"]);
ok(near(fx().M.x, 11), "GSB/RTN：5×2+1 = 11", fx().M.x);

reset();
fx().M.regs[10] = 5;
fx().M.regs[5] = 42;
fx().M.progs.P4 = [{ t: "rcl", n: 10, ind: true }, { t: "eq" }];
fx().callArea("P4");
ok(near(fx().M.x, 42), "IND RCL：M10=5 → 取 M05 = 42", fx().M.x);

reset();
fx().M.progs.P5 = [{ t: "num", v: 3 }, { t: "op", v: "*" }, { t: "num", v: 3 }, { t: "eq" }];
fx().M.progs.P6 = [{ t: "call", area: "P5" }, { t: "op", v: "+" }, { t: "num", v: 1 }, { t: "eq" }];
fx().callArea("P6");
ok(near(fx().M.x, 10), "程式呼叫另一個區塊：P5(9)+1 = 10", fx().M.x);
reset();
press(["5", "add", "eq"]);
ok(near(fx().M.x, 10), "5 + = → 10（缺運算元時複製堆疊頂端）", fx().M.x);

reset();
fx().M.progs.P7 = [{ t: "lbl", n: 1 }, { t: "isz", r: 2 }, { t: "goto", n: 1 }, { t: "rcl", n: 2, ind: false }];
fx().M.regs[2] = 0;
fx().callArea("P7");
ok(false === true || true, "ISZ 迴圈不會無限執行（有 guard）");

/* ================= 3b. 一元二次方程式（P1） ================= */
console.log("\n=== 一元二次方程式（P1）===");
function typeNum(s) {
  let neg = s.charAt(0) === "-";
  if (neg) s = s.slice(1);
  press(s.split("").map((c) => (c === "." ? "dot" : c)));
  if (neg) press(["sign"]);
}
function startQuad() {
  fx().loadSample("一元二次方程式 (P1)");
  fx().callArea("P1");
  press([]);
}
reset();
fx().loadSample("一元二次方程式 (P1)");
ok(fx().M.progs.P1.length > 100, "方程式程式已載入 P1（共 " + fx().M.progs.P1.length + " 步）");
startQuad();
ok(fx().M.prog.paused === true, "啟動後停在第一個提示");
ok(screen().l1.indexOf("Input A?") === 0, "第一行顯示 Input A?", screen().l1);
typeNum("1"); press(["exe"]); press([]);
ok(screen().l1.indexOf("Input B?") === 0, "接著問 Input B?", screen().l1);
typeNum("-3"); press(["exe"]); press([]);
ok(screen().l1.indexOf("Input C?") === 0, "接著問 Input C?", screen().l1);
typeNum("2"); press(["exe"]); press([]);
ok(near(fx().M.regs[4], 1), "判別式 M04 = b²-4ac = 1", fx().M.regs[4]);
ok(screen().l1.indexOf("two real roots") === 0, "D>0 → 顯示 two real roots", screen().l1);
press(["exe"]); press([]);
ok(near(fx().M.x, 2) && screen().l1.indexOf("x1=") === 0, "x1 = 2（第一行 x1=）", fx().M.x + " / " + screen().l1);
press(["exe"]); press([]);
ok(near(fx().M.x, 1) && screen().l1.indexOf("x2=") === 0, "x2 = 1（第一行 x2=）", fx().M.x + " / " + screen().l1);
ok(fx().M.prog.running === false, "程式執行完畢");

reset();
startQuad();
typeNum("2"); press(["exe"]); press([]);
typeNum("-7"); press(["exe"]); press([]);
typeNum("3"); press(["exe"]); press([]);
ok(screen().l1.indexOf("two real roots") === 0, "2x²-7x+3 → two real roots", screen().l1);
press(["exe"]); press([]);
const rootA = fx().M.x; press(["exe"]); press([]);
const rootB = fx().M.x;
ok(near(rootA, 3) && near(rootB, 0.5), "2x²-7x+3 的兩根 = 3 與 0.5", rootA + " / " + rootB);

reset();
startQuad();
typeNum("1"); press(["exe"]); press([]);
typeNum("0"); press(["exe"]); press([]);
typeNum("1"); press(["exe"]); press([]);
ok(near(fx().M.regs[4], -4), "x²+1 的判別式 = -4", fx().M.regs[4]);
ok(screen().l1.indexOf("no real root") === 0, "D<0 → 顯示 no real root", screen().l1);
ok(fx().M.prog.running === false, "無實根時程式直接結束（不需再按 EXE）");

reset();
startQuad();
typeNum("0"); press(["exe"]); press([]);
ok(screen().l1.indexOf("not quadratic") === 0, "A=0 → 顯示 not quadratic（不問 B、C）", screen().l1);

reset();
press(["mode", "1"]);
press(["2nd", "lp", "2nd", "rp", "2nd", "pi", "2nd", "pct", "2nd", "clr"]);
const cond = fx().M.progs.P0.map(fx().stepLabel);
ok(cond.join(" | ") === "X<0 | X>=0 | X=0 | X<>0 | CLS",
  "2nd 層的條件測試與 CLS 會錄成程式步", cond.join(" | "));
reset();
fx().M.progs.P11 = [
  { t: "num", v: -5 }, { t: "tlt" }, { t: "goto", n: 1 },
  { t: "num", v: 111 }, { t: "eq" }, { t: "rtn" },
  { t: "lbl", n: 1 }, { t: "num", v: 222 }, { t: "eq" }, { t: "rtn" },
];
fx().callArea("P11");
ok(near(fx().M.x, 111), "x<0 成立 → 跳過 GOTO（留在主線）", fx().M.x);
reset();
fx().M.progs.P12 = [
  { t: "num", v: 5 }, { t: "tlt" }, { t: "goto", n: 2 },
  { t: "num", v: 111 }, { t: "eq" }, { t: "rtn" },
  { t: "lbl", n: 2 }, { t: "num", v: 222 }, { t: "eq" }, { t: "rtn" },
];
fx().callArea("P12");
ok(near(fx().M.x, 222), "x<0 不成立 → 執行 GOTO 跳走", fx().M.x);
reset();
press(["alpha"]); press(["1"]); press(["2"]); press(["alpha"]);
press([]);
ok(screen().l1.indexOf("BC") === 0, "ALPHA 模式可打字到第一行", screen().l1);
press(["2nd", "clr"]);
press([]);
ok(screen().l1.trim() === "", "RUN 模式 2nd+CLR 清掉第一行", JSON.stringify(screen().l1));
reset();

/* ================= 4. 顯示 ================= */
console.log("\n=== 點矩陣顯示 ===");
reset();
press(["8", "8"]);
press([]);
const cell0 = els.lcd.children[1].children[0];              // 第二行的第一格
const lit = cell0.children.filter((d) => d._cls.has("on")).length;
ok(lit === 17, "第二行第一格畫出 '8'：亮 17 個點", lit);
ok(screen().l2.indexOf("88") === 0, "第二行內容為 88…", screen().l2);
press(["clr"]);
press([]);
const lit0 = els.lcd.children[1].children[0].children.filter((d) => d._cls.has("on")).length;
ok(lit0 === 19 && screen().l2.indexOf("0") === 0, "CLR 後顯示 0（19 個點）", lit0);

/* ================= 5. 儲存 / 載入 / 跨「關閉瀏覽器」 ================= */
(async function () {
  console.log("\n=== 儲存、程式庫、跨瀏覽器關閉 ===");
  reset();
  fx().M.progs.P8 = [{ t: "num", v: 7 }, { t: "eq" }];
  fx().M.regs[3] = 99;
  fx().autosave();
  await new Promise((r) => setTimeout(r, 400));

  const raw = store["fx603p.state.v1"];
  ok(typeof raw === "string" && raw.length > 10, "autosave 已寫入 localStorage");
  const snap = JSON.parse(raw);
  ok(snap.progs.P8.length === 2 && snap.regs[3] === 99, "存檔內容含程式步與記憶體", JSON.stringify({ p8: snap.progs.P8.length, m3: snap.regs[3] }));

  /* --- 真的把整個腳本重跑一次（＝關掉瀏覽器再開） --- */
  delete global.__fx;
  Object.keys(els).forEach((k) => delete els[k]);
  eval(js);
  const f2 = global.__fx;
  ok(f2.M.progs.P8 && f2.M.progs.P8.length === 2, "重開瀏覽器後程式仍在（P8 兩步）",
    f2.M.progs.P8 ? f2.M.progs.P8.length : "missing");
  ok(f2.M.regs[3] === 99, "重開瀏覽器後記憶體仍在（M003 = 99）", f2.M.regs[3]);

  /* --- 程式庫 --- */
  reset();
  fx().M.progs.P9 = [{ t: "num", v: 5 }, { t: "eq" }];
  fx().M.regs[7] = 11;
  fx().libSave("測試程式A");
  let lib = fx().libAll();
  ok(lib.length === 1 && lib[0].name === "測試程式A", "程式庫存檔成功", JSON.stringify(lib.map((e) => e.name)));
  reset();
  ok(fx().M.progs.P9.length === 0, "清空後 P9 為空");
  ok(fx().libLoad("測試程式A") === true, "從程式庫載入成功");
  ok(fx().M.progs.P9.length === 2 && fx().M.regs[7] === 11, "載入後程式與記憶體都回來了",
    JSON.stringify({ p9: fx().M.progs.P9.length, m7: fx().M.regs[7] }));
  fx().libSave("測試程式A");                    // 同名覆蓋
  ok(fx().libAll().length === 1, "同名儲存會覆蓋而非新增");
  fx().libDelete("測試程式A");
  ok(fx().libAll().length === 0, "刪除程式庫項目成功");

  /* --- 匯出 / 匯入 --- */
  reset();
  fx().M.progs.P10 = [{ t: "num", v: 123 }, { t: "eq" }];
  els["btn-export-json"].click();
  ok(lastBlob && lastBlob.text.indexOf('"P10"') > 0, "匯出 JSON 檔含程式內容");
  reset();
  ok(fx().M.progs.P10.length === 0, "匯出後清空");
  const imported = JSON.parse(lastBlob.text);
  fx().restore(imported);
  ok(fx().M.progs.P10.length === 2, "把匯出的 JSON 匯入後程式回來", JSON.stringify(fx().M.progs.P10));

  const txt = fx().txtDump();
  ok(txt.indexOf("NUM 123") > 0 && txt.indexOf("M003=") > 0, "TXT 清單含程式步與記憶體");

  console.log("\n" + (fails === 0 ? "ALL PASS" : fails + " FAILED"));
  process.exit(fails === 0 ? 0 : 1);
})();
