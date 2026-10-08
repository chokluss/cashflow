import { useEffect, useState } from "react";

const KEY = "cashflow-clp";
const DEFAULT = {
  salary: 1200000,
  payday: 1,
  bills: [
    { id: 1, name: "Rent", amt: 450000 },
    { id: 2, name: "Utilities", amt: 60000 },
    { id: 3, name: "Subscriptions", amt: 30000 },
  ],
  tx: [],
  goal: { name: "Vacation", target: 2000000, saved: 0 },
};

// Chilean format: $1.200.000 / decimals with a comma
const f = (n, d = 0) =>
  (n < 0 ? "-" : "") +
  "$" +
  Math.abs(n)
    .toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })
    .replace(/[,.]/g, (c) => (c === "," ? "." : ","));

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const d = { ...DEFAULT, ...(raw ? JSON.parse(raw) : {}) };
    if (!Array.isArray(d.bills)) d.bills = [];
    return d;
  } catch {
    return DEFAULT;
  }
}

function useNow(ms = 50) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return now;
}

const payDate = (day, y, m) =>
  new Date(y, m, Math.min(Math.max(day || 1, 1), new Date(y, m + 1, 0).getDate()));

function calc(d, now) {
  const n = new Date(now);
  let a = payDate(d.payday, n.getFullYear(), n.getMonth());
  if (a > n) a = payDate(d.payday, n.getFullYear(), n.getMonth() - 1);
  const b = payDate(d.payday, a.getFullYear(), a.getMonth() + 1);
  const tot = (b - a) / 1000;
  const el = (n - a) / 1000;
  const sal = +d.salary || 0;
  const bills = d.bills.reduce((t, x) => t + x.amt, 0);
  const rate = (sal - bills) / tot;
  const inc = (sal / tot) * el;
  const bil = (bills / tot) * el;
  const txs = d.tx.reduce((s, t) => s + (t.type === "in" ? t.amt : -t.amt), 0);
  return { tot, el, sal, bills, rate, inc, bil, bal: inc - bil + txs, next: b, pct: (el / tot) * 100 };
}

function recovery(c) {
  if (c.rate <= 0) return <>never at the current rate (bills ≥ salary)</>;
  const days = -c.bal / (c.rate * 86400);
  const when = new Date(Date.now() + days * 86400000).toLocaleDateString([], { month: "short", day: "numeric" });
  return (
    <>
      <b>{days < 1 ? "< 1 day" : days.toFixed(1) + " days"}</b> · back to $0 on {when}
    </>
  );
}

function projection(d, c) {
  const g = d.goal;
  const cur = (+g.saved || 0) + c.bal;
  const tgt = +g.target || 0;
  const rem = tgt - cur;
  let out = "–", sub = "";
  if (tgt <= 0) sub = "Set a target amount to see a projection.";
  else if (rem <= 0) { out = "🎉 Goal reached"; sub = `You're ${f(-rem)} above your target.`; }
  else if (c.rate <= 0) { out = "Not reachable"; sub = "Your bills are equal to or higher than your salary, so nothing is being saved."; }
  else {
    const days = rem / (c.rate * 86400);
    const dt = new Date(Date.now() + days * 86400000);
    out = days < 1 ? Math.max(1, Math.ceil(days * 24)) + " hours" : Math.ceil(days).toLocaleString("en-US").replace(",", ".") + " days";
    sub =
      (days >= 45 ? `≈ ${(days / 30.44).toFixed(1).replace(".", ",")} months · ` : "") +
      `Reached around ${dt.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })} · ${f(rem)} to go`;
  }
  const pct = tgt > 0 ? Math.max(cur / tgt, 0) * 100 : 0;
  return { out, sub, cur, tgt, pct };
}

function Home({ d, c, set }) {
  const neg = c.bal < 0;
  const del = (id) => set({ tx: d.tx.filter((t) => t.id !== id) });
  return (
    <>
      <div className="card">
        <div className="lbl">Available this cycle</div>
        <div className={"big" + (neg ? " neg" : "")}>{f(c.bal, 2)}</div>
        <div className="sub">{c.rate >= 0 ? "+" : "-"}{f(Math.abs(c.rate), 3)} CLP / sec</div>
        {neg && <div className="rec">Days until net balance: {recovery(c)}</div>}
        <div className="bar"><i style={{ width: c.pct + "%" }} /></div>
        <div className="sub" style={{ marginTop: 6 }}>{c.pct.toFixed(1)}% of the pay cycle elapsed</div>
      </div>
      <div className="grid">
        <div className="stat"><span className="lbl">Per hour</span><b className="pos">{f(c.rate * 3600)}</b></div>
        <div className="stat"><span className="lbl">Per day</span><b className="pos">{f(c.rate * 86400)}</b></div>
        <div className="stat"><span className="lbl">Accrued income</span><b>{f(c.inc)}</b></div>
        <div className="stat"><span className="lbl">Accrued bills</span><b className="neg">{f(c.bil)}</b></div>
      </div>
      <h2>One-time movements</h2>
      {d.tx.length === 0 && <div className="empty">No one-time movements yet.<br />Tap “Add” to log a purchase or extra income.</div>}
      {[...d.tx].reverse().map((t) => (
        <div className="tx" key={t.id}>
          <div className={"ic " + (t.type === "in" ? "pos" : "neg")}>{t.type === "in" ? "↓" : "↑"}</div>
          <div className="m">
            <div>{t.label}</div>
            <div className="sub">{new Date(t.id).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
          </div>
          <b className={t.type === "in" ? "pos" : "neg"}>{t.type === "in" ? "+" : "-"}{f(t.amt)}</b>
          <button aria-label="Delete" onClick={() => del(t.id)}>✕</button>
        </div>
      ))}
    </>
  );
}

function Setup({ d, c, set }) {
  const [bn, setBn] = useState("");
  const [ba, setBa] = useState("");
  const addBill = () => {
    const amt = Math.abs(+ba);
    if (!amt) return;
    set({ bills: [...d.bills, { id: Date.now(), name: bn.trim() || "Bill", amt }] });
    setBn(""); setBa("");
  };
  return (
    <>
      <div className="card">
        <div className="lbl">Monthly setup</div>
        <label htmlFor="sal">Monthly salary (CLP)</label>
        <input id="sal" type="number" inputMode="decimal" min="0" value={d.salary} onChange={(e) => set({ salary: +e.target.value || 0 })} />
        <label htmlFor="pday">Payment day (day of the month you get paid)</label>
        <input id="pday" type="number" inputMode="numeric" min="1" max="31" value={d.payday}
          onChange={(e) => { const n = Math.round(+e.target.value); if (n >= 1 && n <= 31) set({ payday: n }); }} />
        <div className="sub" style={{ marginTop: 10 }}>
          Next payday: {c.next.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
        </div>
      </div>
      <div className="card">
        <div className="lbl">Monthly bills</div>
        <div style={{ marginTop: 10 }}>
          {d.bills.length === 0 && <div className="empty" style={{ padding: 8 }}>No bills yet.</div>}
          {d.bills.map((b) => (
            <div className="tx" key={b.id}>
              <div className="m"><div>{b.name}</div></div>
              <b className="neg">{f(b.amt)}</b>
              <button aria-label="Delete" onClick={() => set({ bills: d.bills.filter((x) => x.id !== b.id) })}>✕</button>
            </div>
          ))}
        </div>
        <div className="two" style={{ marginTop: 8 }}>
          <input placeholder="Bill name (Rent…)" value={bn} onChange={(e) => setBn(e.target.value)} />
          <input type="number" inputMode="decimal" min="0" placeholder="Amount" value={ba} onChange={(e) => setBa(e.target.value)} />
        </div>
        <button className="go sm" onClick={addBill}>＋ Add bill</button>
        <div className="tot"><span>Total bills</span><span className="neg">{f(c.bills)}</span></div>
        <div className="sub" style={{ marginTop: 10 }}>Net per cycle: {f(c.sal - c.bills)}</div>
      </div>
      <div className="card sub">
        Your salary and bills are spread evenly across every second of the pay cycle (from one payday to the next), so the counter climbs continuously.
      </div>
      <button className="go" style={{ background: "var(--chip)", color: "var(--ink)" }} onClick={() => set({ tx: [] })}>
        Clear all movements
      </button>
    </>
  );
}

function Goal({ d, c, set }) {
  const p = projection(d, c);
  const g = d.goal;
  const upd = (patch) => set({ goal: { ...g, ...patch } });
  return (
    <>
      <div className="card">
        <div className="lbl">{g.name || "Savings goal"}</div>
        <div className="big">{p.out}</div>
        <div className="sub">{p.sub}</div>
        <div className="bar"><i style={{ width: Math.min(p.pct, 100) + "%" }} /></div>
        <div className="sub" style={{ marginTop: 6 }}>
          {f(p.cur, 2)} of {f(p.tgt)}{p.tgt > 0 && ` (${p.pct.toFixed(1).replace(".", ",")}%)`}
        </div>
      </div>
      <div className="card">
        <div className="lbl">Goal setup</div>
        <label htmlFor="gname">Goal name</label>
        <input id="gname" placeholder="Vacation, laptop, emergency fund…" value={g.name} onChange={(e) => upd({ name: e.target.value })} />
        <label htmlFor="gtarget">Target amount (CLP)</label>
        <input id="gtarget" type="number" inputMode="decimal" min="0" value={g.target} onChange={(e) => upd({ target: +e.target.value || 0 })} />
        <label htmlFor="gsaved">Already saved (CLP)</label>
        <input id="gsaved" type="number" inputMode="decimal" min="0" value={g.saved} onChange={(e) => upd({ saved: +e.target.value || 0 })} />
      </div>
      <div className="card sub">
        The projection adds your live available balance to what you've already saved, then assumes your current net income per second (salary minus bills) keeps going.
      </div>
    </>
  );
}

function AddSheet({ onClose, onAdd }) {
  const [kind, setKind] = useState("out");
  const [label, setLabel] = useState("");
  const [amt, setAmt] = useState("");
  const submit = () => {
    const a = Math.abs(+amt);
    if (!a) return;
    onAdd({ id: Date.now(), type: kind, label: label.trim() || (kind === "in" ? "Income" : "Expense"), amt: a });
  };
  return (
    <div className="scrim on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="lbl">New movement</div>
        <div className="seg">
          <button className={kind === "out" ? "on" : ""} onClick={() => setKind("out")}>Expense</button>
          <button className={kind === "in" ? "on" : ""} onClick={() => setKind("in")}>Income</button>
        </div>
        <label htmlFor="tl">Description</label>
        <input id="tl" placeholder="Coffee, groceries, bonus…" value={label} onChange={(e) => setLabel(e.target.value)} />
        <label htmlFor="ta">Amount</label>
        <input id="ta" type="number" inputMode="decimal" min="0" placeholder="0" autoFocus value={amt} onChange={(e) => setAmt(e.target.value)} />
        <button className="go" onClick={submit}>Add to balance</button>
      </div>
    </div>
  );
}

const TABS = [["home", "◉", "Live"], ["setup", "⚙", "Setup"], ["goal", "★", "Goal"]];

export default function App() {
  const [d, setD] = useState(load);
  const [tab, setTab] = useState("home");
  const [sheet, setSheet] = useState(false);
  const now = useNow();
  const c = calc(d, now);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {}
  }, [d]);

  const set = (patch) => setD((x) => ({ ...x, ...patch }));
  const Page = { home: Home, setup: Setup, goal: Goal }[tab];

  return (
    <div className="app">
      <header>
        <h1>Cashflow Live</h1>
        <div className="live"><span className="dot" />ticking</div>
      </header>
      <main><Page d={d} c={c} set={set} /></main>
      {tab === "home" && <button className="fab" onClick={() => setSheet(true)}>＋ Add</button>}
      <nav>
        {TABS.map(([id, icon, label]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            <span>{icon}</span>{label}
          </button>
        ))}
      </nav>
      {sheet && (
        <AddSheet
          onClose={() => setSheet(false)}
          onAdd={(t) => { set({ tx: [...d.tx, t] }); setSheet(false); }}
        />
      )}
    </div>
  );
}
