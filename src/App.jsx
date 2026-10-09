import { useEffect, useState } from "react";
import { DEFAULT, f, mi, calc, settle, sync, debtBalPatch, cycleSummary, cycleGroups, openCycle } from "./logic.js";
import { loadData, saveData } from "./auth.js";
import { AccountCard, UsersCard } from "./Account.jsx";

// each user has their own data
function load(userId) {
  return { ...structuredClone(DEFAULT), ...(loadData(userId) || {}) };
}

function useNow(ms = 50) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return now;
}

// on wide screens all three pages are shown side by side
function useWide() {
  const q = "(min-width:960px)";
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const h = (e) => setWide(e.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return wide;
}

/* ---------------- Live tab ---------------- */

function Gauge({ s }) {
  const pc = Math.round(s * 100) || 0;
  const label =
    s >= 0.999 ? "MAX SPEED · all income, no payments"
    : Math.abs(s) < 0.005 ? "STALL · income equals outflow"
    : s < 0 ? "REVERSE · spending more than you earn"
    : `Moving forward · ${pc}% of your income is left over`;
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <div className="lbl" style={{ textAlign: "left" }}>Money speed</div>
      <svg viewBox="0 0 200 124" style={{ width: "100%", maxWidth: 300, marginTop: 4 }} role="img" aria-label="Money speed gauge">
        <defs>
          <linearGradient id="spg" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#c23b3b" /><stop offset=".5" stopColor="#e0a526" /><stop offset="1" stopColor="#1f9d62" />
          </linearGradient>
        </defs>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="url(#spg)" strokeWidth="14" strokeLinecap="round" />
        <g fontSize="8" fontWeight="600" style={{ fill: "var(--mute)" }}>
          <text x="100" y="9" textAnchor="middle">STALL</text>
          <text x="4" y="118">REVERSE</text>
          <text x="196" y="118" textAnchor="end">MAX SPEED</text>
        </g>
        <g transform={`rotate(${s * 90} 100 100)`}>
          <line x1="100" y1="100" x2="100" y2="34" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <circle cx="100" cy="100" r="6" fill="currentColor" />
        </g>
      </svg>
      <div className="big" style={{ fontSize: 30, margin: 0, color: pc < 0 ? "var(--neg)" : undefined }}>{pc > 0 ? "+" : ""}{pc}%</div>
      <div className="sub">{label}</div>
    </div>
  );
}

function GoalCard({ g }) {
  return (
    <div className="card">
      <div className="lbl">{g.name || "Savings goal"}</div>
      <div className="big">{g.out}</div>
      <div className="sub">{g.sub}</div>
      {g.target > 0 && (
        <>
          <div className="bar"><i style={{ width: g.pct + "%" }} /></div>
          <div className="sub" style={{ marginTop: 6 }}>{f(g.cur, 2)} of {f(g.target)} ({g.pct.toFixed(1).replace(".", ",")}%)</div>
        </>
      )}
    </div>
  );
}

function DebtCard({ x }) {
  if (!x.show) return null;
  const card = x.kind === "card", loan = x.kind === "loan", bor = x.kind === "borrowed";
  return (
    <div className="card">
      <div className="lbl">{(x.name || "Debt") + (card ? " · credit card" : loan ? " · loan" : "")}</div>
      <div className="big">{f(x.debt, 2)}</div>
      <div className="sub">{x.drate <= 0 ? "-" : "+"}{f(Math.abs(x.drate), 3)} CLP / sec</div>
      {(card || loan) && (
        <>
          <div className="bar"><i style={{ width: (card ? x.usedPct : x.loanPct) + "%", background: card && x.usedPct > 85 ? "var(--neg)" : undefined }} /></div>
          <div className="sub" style={{ marginTop: 6 }}>
            {card
              ? x.limit > 0 ? `Used ${f(x.debt)} of ${f(x.limit)} · Available ${f(x.avail)}` : "Set your credit limit in the Plan tab"
              : `Paid ${f(x.loanPaid)} of ${f(x.total)} total (${x.loanPct.toFixed(1).replace(".", ",")}%)`}
          </div>
        </>
      )}
      {bor && <div className="sub" style={{ marginTop: 6 }}>No limit · no monthly installments</div>}
      <div className="sub" style={{ marginTop: 4 }}>
        {bor ? (x.added > 0 ? `Added since payday: ${f(x.added)}` : "") : `Paid since payday: ${f(x.paid)}${x.skipped ? " (skipped this cycle)" : ""}`}
      </div>
      {x.def > 0 && <div className="rec" style={{ marginTop: 10 }}>Your income doesn't cover your payments — {f(x.def)} per cycle is being borrowed</div>}
      <div className="sub" style={{ marginTop: 10 }}>{x.payoff}</div>
    </div>
  );
}

function Home({ c }) {
  const neg = c.bal < 0;
  const sg = c.net >= 0 ? "+" : "";
  return (
    <>
      <div className="card">
        <div className="proj"><span>Projected at payday</span><b className={c.projected < 0 ? "neg" : "pos"}>{f(c.projected)}</b></div>
        <div className="proj" style={{ marginTop: -6 }}><span>Total spending this cycle</span><b className="neg">{f(c.billsTotal + c.purchases)}</b></div>
        <div className="lbl">Available this cycle</div>
        <div className={"big" + (neg ? " neg" : "")}>{f(c.bal, 2)}</div>
        <div className={"sub rates " + (c.net < 0 ? "neg" : "pos")}>
          <span>{c.net >= 0 ? "+" : "-"}{f(Math.abs(c.net), 3)} CLP / sec</span>
          <span>{sg}{f(c.net * 3600)} / hour</span>
          <span>{sg}{f(c.net * 86400)} / day</span>
        </div>
        {neg && <div className="rec">{c.rec}</div>}
        <div className="bar"><i style={{ width: c.pct + "%" }} /></div>
        <div className="sub" style={{ marginTop: 6 }}>{c.pct.toFixed(1)}% of the pay cycle elapsed · leftover moves to your goals at payday</div>
      </div>
      <Gauge s={c.speed} />
      {c.goals.map((g) => <GoalCard key={g.id} g={g} />)}
      {c.debts.map((x) => <DebtCard key={x.id} x={x} />)}
      <div className="grid">
        <div className="stat"><span className="lbl">Accrued income</span><b>{f(c.inc)}</b></div>
        <div className="stat"><span className="lbl">Accrued bills</span><b className="neg">{f(c.bil + c.paidSum)}</b></div>
      </div>
    </>
  );
}

/* ---------------- Movements tab ---------------- */

const dShort = (ms) => new Date(ms).toLocaleDateString([], { day: "numeric", month: "short" });

function Row({ t, debtName, onDel, skipped, onSkip }) {
  const isIn = t.type === "in";
  const credit = t.type === "credit";
  return (
    <div className="tx">
      <div className={"ic " + (isIn ? "pos" : "neg")}>{isIn ? "↓" : t.type === "bill" ? "↻" : credit ? "💳" : "↑"}</div>
      <div className="m">
        <div>{t.label}</div>
        <div className="sub">
          {credit
            ? `Credit payment · ${debtName || "debt"}${skipped ? " · skipped this month" : " · monthly"}`
            : t.type === "bill"
            ? "Monthly bill"
            : new Date(t.id).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
      <b className={isIn ? "pos" : "neg"} style={skipped ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>
        {isIn ? "+" : "-"}{f(t.amt)}
      </b>
      {credit && <button className="skipb" onClick={onSkip}>{skipped ? "Restore" : "Skip"}</button>}
      <button aria-label="Delete" onClick={onDel}>✕</button>
    </div>
  );
}

function Movements({ S, c, set, onAdd }) {
  const del = (id) =>
    set((s) => {
      const t = s.tx.find((x) => x.id === id);
      return { tx: s.tx.filter((x) => x.id !== id), debts: t?.auto ? s.debts.map((d) => (d.id === t.debt ? { ...d, installment: 0 } : d)) : s.debts };
    });
  const skip = (id) => set((s) => ({ tx: s.tx.map((t) => (t.id === id ? { ...t, skip: t.skip === c.key ? -1 : c.key } : t)) }));
  const bills = S.tx.filter((t) => t.type === "bill" || t.type === "credit");
  const others = S.tx.filter((t) => t.type !== "bill" && t.type !== "credit").reverse();
  return (
    <>
      <button className="addbtn" onClick={onAdd}>＋ Add bill, purchase, credit payment or income</button>
      <div className="card">
        <div className="lbl">Totals</div>
        <div className="tot"><span>Monthly bills</span><span className="neg">{f(c.billsTotal)}</span></div>
        <div className="tot"><span>Purchases (this cycle)</span><span className="neg">{f(c.purchases)}</span></div>
        <div className="tot"><span>Extra income (this cycle)</span><span className="pos">{f(c.incomeX)}</span></div>
      </div>
      {S.tx.length === 0 && <div className="empty">Nothing added yet.<br />Tap “Add” to log a bill, a purchase, a credit payment or extra income.</div>}
      {bills.length > 0 && (
        <>
          <h2>Monthly bills</h2>
          {bills.map((t) => (
            <Row key={t.id} t={t} debtName={S.debts.find((x) => x.id === t.debt)?.name} onDel={() => del(t.id)} skipped={t.skip === c.key} onSkip={() => skip(t.id)} />
          ))}
        </>
      )}
      {others.length > 0 && (
        <>
          <h2>Purchases &amp; income</h2>
          {others.map((t) => <Row key={t.id} t={t} onDel={() => del(t.id)} />)}
        </>
      )}
    </>
  );
}

/* ---------------- History tab ---------------- */

function CycleCard({ title, tag, cy, open, onClick }) {
  const s = cycleSummary(cy, open);
  const mx = Math.max(s.income, s.spent, 1);
  return (
    <div className={"card" + (onClick ? " tap" : "")} onClick={onClick}>
      <div className="hh"><span className="lbl">{title}</span><b className={cy.closing < 0 ? "neg" : "pos"}>{tag}</b></div>
      <div className="sub" style={{ marginTop: 8 }}>Income {f(s.income)}</div>
      <div className="hbar pos"><i style={{ width: (s.income / mx) * 100 + "%" }} /></div>
      <div className="sub">Spending {f(s.spent)}</div>
      <div className="hbar neg"><i style={{ width: (s.spent / mx) * 100 + "%" }} /></div>
      {s.rows.map(([l, v, k]) => <div className="hrow" key={l}><span>{l}</span><span className={k}>{v}</span></div>)}
      {cy.moved?.length > 0 && (
        <div className="sub" style={{ marginTop: 10 }}>
          → {cy.moved.map((m) => `${m.name || "Savings"} ${m.amt > 0 ? "+" : ""}${f(m.amt)}`).join(" · ")}
        </div>
      )}
      {onClick && <div className="sub" style={{ marginTop: 8 }}>Tap to see movements ›</div>}
    </div>
  );
}

// read-only view of one closed cycle
function CycleDetail({ cy, onClose }) {
  const s = cycleSummary(cy);
  const groups = cycleGroups(cy);
  return (
    <div className="scrim on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet det">
        <div className="hh">
          <span className="lbl">{dShort(cy.start)} – {dShort(cy.end - 1)}</span>
          <b className={cy.closing < 0 ? "neg" : "pos"}>Closed {cy.closing > 0 ? "+" : ""}{f(cy.closing)}</b>
        </div>
        <div className="sub" style={{ margin: "6px 0 10px" }}>Read only</div>
        {s.rows.map(([l, v, k]) => <div className="hrow" key={l}><span>{l}</span><span className={k}>{v}</span></div>)}
        {groups.length === 0 && <div className="empty">No movement detail was saved for this cycle.</div>}
        {groups.map((g) => (
          <div key={g.title}>
            <h2>{g.title}</h2>
            {g.rows.map((r, i) => (
              <div className="tx" key={i}>
                <div className={"ic " + r.cls}>{r.icon}</div>
                <div className="m"><div>{r.label}</div><div className="sub">{r.sub}</div></div>
                <b className={r.cls} style={r.skipped ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>{r.amt}</b>
              </div>
            ))}
          </div>
        ))}
        <button className="go" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function History({ S, c }) {
  const [sel, setSel] = useState(null);
  const cy = [...(S.cycles || [])].reverse();
  const sum = (fn) => cy.reduce((t, x) => t + fn(x), 0);
  return (
    <>
      <CycleCard title="This cycle so far" tag={f(c.bal)} cy={openCycle(c)} open />
      {cy.length === 0 && <div className="empty">No closed cycles yet.<br />Each pay cycle closes at payday and appears here.</div>}
      {cy.length > 0 && (
        <div className="card">
          <div className="lbl">All closed cycles</div>
          <div className="hrow"><span>Cycles closed</span><span>{cy.length}</span></div>
          <div className="hrow"><span>Total income</span><span className="pos">{f(sum((x) => (x.salary || 0) + (x.income || 0)))}</span></div>
          <div className="hrow"><span>Total spending</span><span className="neg">{f(sum((x) => (x.bills || 0) + (x.purchases || 0)))}</span></div>
          <div className="hrow"><span>Saved to goals</span><span className="pos">{f(sum((x) => x.closing || 0))}</span></div>
        </div>
      )}
      {cy.map((x) => (
        <CycleCard key={x.key} title={`${dShort(x.start)} – ${dShort(x.end - 1)}`} tag={`Closed ${x.closing > 0 ? "+" : ""}${f(x.closing)}`} cy={x} onClick={() => setSel(x.key)} />
      ))}
      {sel != null && cy.find((x) => x.key === sel) && <CycleDetail cy={cy.find((x) => x.key === sel)} onClose={() => setSel(null)} />}
    </>
  );
}

/* ---------------- Plan tab ---------------- */

const num = (v) => +v || 0;

function DebtRow({ x, c, set }) {
  const kind = x.kind, bor = kind === "borrowed";
  const live = c.debts.find((o) => o.id === x.id)?.debt ?? 0;
  // card: u = used credit, a = available credit | loan: u = total loan, a = already paid | borrowed: u = balance
  const [u, setU] = useState(() => String(Math.round(kind === "loan" ? +x.total || 0 : live)));
  const [a, setA] = useState(() => String(Math.round(kind === "loan" ? Math.max(0, (+x.total || 0) - live) : +x.limit || 0)));
  const patch = (s, fields, bal) => (bal == null ? s.debts : debtBalPatch(s, x.id, bal)).map((o) => (o.id === x.id ? { ...o, ...fields } : o));
  const onU = (v) => {
    setU(v);
    if (kind === "loan") set((s) => ({ debts: patch(s, { total: num(v) }, Math.max(0, num(v) - num(a))) }));
    else {
      set((s) => ({ debts: patch(s, {}, num(v)) }));
    }
  };
  const onA = (v) => {
    setA(v);
    if (kind === "loan") set((s) => ({ debts: patch(s, {}, Math.max(0, (+x.total || 0) - num(v))) }));
    else set((s) => ({ debts: patch(s, { limit: num(v) }) }));
  };
  const L = bor ? ["Balance (CLP)"] : kind === "loan" ? ["Total loan (CLP)", "Already paid (CLP)"] : ["Used credit (CLP)", "Available credit (CLP)"];
  return (
    <div className="item">
      <div className="hd">
        <input placeholder="Name (credit card, loan…)" value={x.name} disabled={bor}
          onChange={(e) => set((s) => ({ debts: s.debts.map((o) => (o.id === x.id ? { ...o, name: e.target.value } : o)) }))} />
        {!bor && (
          <button className="xb" aria-label="Remove debt"
            onClick={() => set((s) => ({ debts: s.debts.filter((o) => o.id !== x.id), tx: s.tx.filter((t) => !(t.type === "credit" && t.debt === x.id)) }))}>✕</button>
        )}
      </div>
      <div className="cols">
        <div>
          <div className="mini">{L[0]}</div>
          <input type="number" inputMode="decimal" min="0" value={u} onChange={(e) => onU(e.target.value)} />
        </div>
        {!bor && (
          <div>
            <div className="mini">{L[1]}</div>
            <input type="number" inputMode="decimal" min="0" value={a} onChange={(e) => onA(e.target.value)} />
          </div>
        )}
      </div>
      {kind === "card" && (
        <div className="sub" style={{ marginTop: 8 }}>
          Left to use: <b>{f(Math.max(0, (+x.limit || 0) - live))}</b> (available credit minus used credit)
        </div>
      )}
      {bor ? (
        <div className="sub" style={{ marginTop: 8 }}>
          Created automatically when your income doesn't cover your payments. No limit and no installments — pay it back whenever you can.
        </div>
      ) : (
        <>
          <div className="mini">Monthly installment (CLP)</div>
          <input type="number" inputMode="decimal" min="0" value={x.installment || 0}
            onChange={(e) => set((s) => ({ debts: s.debts.map((o) => (o.id === x.id ? { ...o, installment: num(e.target.value) } : o)) }))} />
          <div className="sub" style={{ marginTop: 6 }}>Shows up as a monthly movement in the Movements tab.</div>
        </>
      )}
    </div>
  );
}

function GoalRow({ g, i, set }) {
  const upd = (patch) => set((s) => ({ goals: s.goals.map((o) => (o.id === g.id ? { ...o, ...patch } : o)) }));
  return (
    <div className="item">
      <div className="hd">
        <input placeholder="Goal name (vacation, laptop…)" value={g.name} onChange={(e) => upd({ name: e.target.value })} />
        {i > 0 && (
          <button className="xb" aria-label="Move up"
            onClick={() => set((s) => { const a = [...s.goals]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return { goals: a }; })}>↑</button>
        )}
        <button className="xb" aria-label="Remove goal" onClick={() => set((s) => ({ goals: s.goals.filter((o) => o.id !== g.id) }))}>✕</button>
      </div>
      <div className="cols">
        <div>
          <div className="mini">Target (CLP)</div>
          <input type="number" inputMode="decimal" min="0" value={g.target} onChange={(e) => upd({ target: +e.target.value || 0 })} />
        </div>
        <div>
          <div className="mini">Already saved (CLP)</div>
          <input type="number" inputMode="decimal" min="0" value={g.saved} onChange={(e) => upd({ saved: +e.target.value || 0 })} />
        </div>
      </div>
    </div>
  );
}

function ClearData({ set }) {
  const [sure, setSure] = useState(false);
  useEffect(() => {
    if (!sure) return;
    const t = setTimeout(() => setSure(false), 4000);
    return () => clearTimeout(t);
  }, [sure]);
  return (
    <div className="card">
      <div className="lbl">Data</div>
      <div className="sub" style={{ margin: "8px 0 12px" }}>Remove every bill, purchase, credit payment and income entry you've added.</div>
      <button
        className="go"
        style={{ marginTop: 0, background: sure ? "var(--neg)" : "var(--chip)", color: sure ? "#fff" : "var(--ink)" }}
        onClick={() => { if (sure) { set({ tx: [] }); setSure(false); } else setSure(true); }}
      >
        {sure ? "Tap again to confirm" : "Clear all bills & movements"}
      </button>
    </div>
  );
}

function Plan({ S, c, set, user, setUser, onLogout }) {
  return (
    <>
      <div className="card">
        <div className="lbl">Monthly income</div>
        <label htmlFor="sal">Monthly salary (CLP)</label>
        <input id="sal" type="number" inputMode="decimal" min="0" value={S.salary} onChange={(e) => set({ salary: +e.target.value || 0 })} />
        <label htmlFor="pday">Payment day (day of the month you get paid)</label>
        <input id="pday" type="number" inputMode="numeric" min="1" max="31" value={S.payday}
          onChange={(e) => { const n = Math.round(+e.target.value); if (n >= 1 && n <= 31) set((s) => ({ payday: n, cycleKey: calc({ ...s, payday: n }).key })); }} />
        <div className="sub" style={{ marginTop: 10 }}>
          Next payday: {c.next.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
        </div>
        <div className="tot"><span>Monthly bills (incl. credit payments)</span><span className="neg">{f(c.billsTotal)}</span></div>
        <div className="tot"><span>Net per cycle</span><span>{f(c.sal - c.billsTotal)}</span></div>
      </div>

      <div className="card">
        <div className="lbl">Debts</div>
        {S.debts.length === 0 && <div className="empty" style={{ padding: 8 }}>No debts yet.</div>}
        {S.debts.map((x) => <DebtRow key={x.id} x={x} c={c} set={set} />)}
        <div className="cols">
          <button className="go sm" onClick={() => set((s) => ({ debts: [...s.debts, { id: Date.now(), kind: "card", name: "", bal: 0, limit: 0, installment: 0 }] }))}>＋ Add credit card</button>
          <button className="go sm" onClick={() => set((s) => ({ debts: [...s.debts, { id: Date.now(), kind: "loan", name: "", bal: 0, total: 0, installment: 0 }] }))}>＋ Add loan</button>
        </div>
        <div className="sub" style={{ marginTop: 10 }}>
          Each monthly installment shows up as a movement. If your income doesn't cover bills plus payments, the difference is borrowed automatically into a "Borrowed money" debt, with no limit and no installments.
        </div>
      </div>

      <div className="card">
        <div className="lbl">Savings goals</div>
        {S.goals.length === 0 && <div className="empty" style={{ padding: 8 }}>No goals yet.</div>}
        {S.goals.map((g, i) => <GoalRow key={g.id} g={g} i={i} set={set} />)}
        <button className="go sm" onClick={() => set((s) => ({ goals: [...s.goals, { id: Date.now(), name: "", target: 0, saved: 0 }] }))}>＋ Add goal</button>
        <div className="sub" style={{ marginTop: 10 }}>
          Money left at the end of each pay cycle moves to your goals automatically, in the order listed (use ↑ to change the priority). If every goal is met, or you have none, it goes to a Savings item. Each projection assumes your net income per second stays the same.
        </div>
      </div>
      <ClearData set={set} />
      <AccountCard user={user} setUser={setUser} onLogout={onLogout} />
      {user.role === "admin" && <UsersCard user={user} />}
    </>
  );
}

/* ---------------- Add sheet ---------------- */

const KINDS = [
  ["purchase", "Purchase", "One-time: comes off your balance right away."],
  ["bill", "Bill", "Monthly: spread evenly across every second of the pay cycle."],
  ["credit", "Credit", "Credit payment: monthly like a bill, and it pays off the debt you choose. You can skip it in any month.", "Credit payment"],
  ["in", "Income", "One-time extra money, added right away."],
];

function AddSheet({ S, onClose, onAdd }) {
  const [kind, setKind] = useState("purchase");
  const [label, setLabel] = useState("");
  const [amt, setAmt] = useState("");
  const [debt, setDebt] = useState(S.debts[0]?.id ?? 0);
  const [, short, hint, full] = KINDS.find((k) => k[0] === kind);
  const name = full || short;
  const noDebt = kind === "credit" && S.debts.length === 0;
  const submit = () => {
    const a = Math.abs(+amt);
    if (!a || noDebt) return;
    const t = { id: Date.now(), type: kind, label: label.trim() || name, amt: a };
    if (kind === "credit") t.debt = +debt;
    onAdd(t);
  };
  return (
    <div className="scrim on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="lbl">New movement</div>
        <div className="seg">
          {KINDS.map(([id, text]) => (
            <button key={id} className={kind === id ? "on" : ""} onClick={() => setKind(id)}>{text}</button>
          ))}
        </div>
        <div className="sub" style={{ marginTop: 8, color: noDebt ? "var(--neg)" : undefined }}>
          {noDebt ? "Add a debt in the Plan tab first." : hint}
        </div>
        {kind === "credit" && !noDebt && (
          <>
            <label htmlFor="dsel">Pays off debt</label>
            <select id="dsel" value={debt} onChange={(e) => setDebt(e.target.value)}>
              {S.debts.map((x) => <option key={x.id} value={x.id}>{x.name || "Unnamed debt"}</option>)}
            </select>
          </>
        )}
        <label htmlFor="tl">Description</label>
        <input id="tl" placeholder="Rent, groceries, bonus…" value={label} onChange={(e) => setLabel(e.target.value)} />
        <label htmlFor="ta">Amount (CLP)</label>
        <input id="ta" type="number" inputMode="decimal" min="0" placeholder="0" autoFocus value={amt} onChange={(e) => setAmt(e.target.value)} />
        <button className="go" onClick={submit}>Add {name.toLowerCase()}</button>
      </div>
    </div>
  );
}

/* ---------------- App ---------------- */

const PAGES = { home: Home, moves: Movements, hist: History, plan: Plan };
const TITLES = { home: "Live", moves: "Movements", hist: "History", plan: "Plan & settings" };
const TABS = [["home", "◉", "Live"], ["moves", "☰", "Moves"], ["hist", "▦", "History"], ["plan", "★", "Plan"]];

export default function App({ user, setUser, onLogout }) {
  const [S, setS] = useState(() => sync(settle(load(user.id))));
  const [tab, setTab] = useState("home");
  const [sheet, setSheet] = useState(false);
  const wide = useWide();
  const now = useNow();
  const c = calc(S, now);

  useEffect(() => {
    saveData(user.id, S);
  }, [S]);

  useEffect(() => {
    if (S.cycleKey !== c.key || c.needBorrow) setS((x) => sync(settle(x))); // payday passed: close the cycle
  });

  // every change first folds finished cycles into the stored debt balances (settle)
  const set = (p) => setS((x) => { const s = settle(x); return sync({ ...s, ...(typeof p === "function" ? p(s) : p) }); });
  const Page = PAGES[tab];
  const props = { S, c, set, onAdd: () => setSheet(true), user, setUser, onLogout };

  return (
    <div className="app">
      <header>
        <h1>Cashflow Live</h1>
        <div className="live"><span className="dot" />ticking</div>
        <div className="who">
          <span className="av" title={user.email}>{user.name.trim().charAt(0).toUpperCase()}</span>
          <button className="lo" onClick={onLogout}>Log out</button>
        </div>
      </header>
      <main>
        {wide
          ? Object.entries(PAGES).map(([id, P]) => <section key={id} data-title={TITLES[id]}><P {...props} /></section>)
          : <Page {...props} />}
      </main>
      <nav>
        {TABS.map(([id, icon, label]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            <span>{icon}</span>{label}
          </button>
        ))}
      </nav>
      {sheet && <AddSheet S={S} onClose={() => setSheet(false)} onAdd={(t) => { set((s) => ({ tx: [...s.tx, t] })); setSheet(false); }} />}
    </div>
  );
}
