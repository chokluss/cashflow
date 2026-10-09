// Shared calculation logic (pure functions). Everything is counted from payday.
export const KEY = "cashflow-clp-v8";

// Chilean format: $1.200.000 / decimals with a comma
export const f = (n, d = 0) => {
  const v = Math.round(Math.abs(n) * 10 ** d) / 10 ** d; // no "-$0" for tiny negatives
  return (n < 0 && v > 0 ? "-" : "") + "$" + v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[,.]/g, (c) => (c === "," ? "." : ","));
};

export const mi = (dt) => dt.getFullYear() * 12 + dt.getMonth();
const payDate = (day, y, m) => new Date(y, m, Math.min(Math.max(day || 1, 1), new Date(y, m + 1, 0).getDate()));
const dateS = (ms, o) => new Date(ms).toLocaleDateString([], o);
const num = (n) => Math.ceil(n).toLocaleString("en-US").replace(/,/g, ".");
const dec1 = (n) => n.toFixed(1).replace(".", ",");

// example history: the 4 pay cycles before the current one
function sampleCycles() {
  const now = new Date(), k = mi(now);
  const rows = [ // [extra income label, extra income, purchases]
    [null, 0, [["Groceries", 120000], ["Transport", 40000], ["Dining out", 50000]]],
    ["Freelance project", 80000, [["Groceries", 130000], ["Clothes", 150000], ["Gifts", 60000]]],
    [null, 0, [["Groceries", 95000], ["Pharmacy", 25000]]],
    [null, 0, [["Groceries", 110000], ["Car repair", 120000], ["Dining out", 45000]]],
  ];
  const DAY = 86400000;
  return rows.map(([incLabel, income, buys], i) => {
    const key = k - 4 + i, y = Math.floor(key / 12), m = key % 12;
    const start = payDate(1, y, m).getTime();
    const purchases = buys.reduce((t, b) => t + b[1], 0);
    const closing = 1200000 + income - 540000 - 150000 - purchases;
    const items = [
      { type: "bill", label: "Rent", amt: 450000 },
      { type: "bill", label: "Utilities", amt: 60000 },
      { type: "bill", label: "Subscriptions", amt: 30000 },
      { type: "credit", label: "Credit card payment", amt: 150000, debt: "Credit card", skipped: false },
      ...(income ? [{ type: "in", label: incLabel, amt: income, ts: start + 9 * DAY }] : []),
      ...buys.map(([label, amt], j) => ({ type: "purchase", label, amt, ts: start + (3 + j * 7) * DAY })),
    ];
    return {
      key, start, end: payDate(1, y, m + 1).getTime(),
      salary: 1200000, bills: 690000, billsOnly: 540000, credit: 150000, purchases, income,
      debtPaid: 150000, added: 0, closing, moved: [{ name: "Vacation", amt: closing }], items,
    };
  });
}
const SAMPLE = sampleCycles();

export const DEFAULT = {
  salary: 1200000,
  payday: 1,
  debtCycle: 0,
  cycleKey: null, // month index of the open pay cycle
  cycles: SAMPLE, // closed cycles (history)
  debts: [{ id: 1, kind: "card", name: "Credit card", bal: 1800000, limit: 3000000, installment: 150000 }],
  goals: [{ id: 1, name: "Vacation", target: 2000000, saved: SAMPLE.reduce((t, x) => t + x.closing, 0) }],
  tx: [
    { id: 1, type: "bill", label: "Rent", amt: 450000 },
    { id: 2, type: "bill", label: "Utilities", amt: 60000 },
    { id: 3, type: "bill", label: "Subscriptions", amt: 30000 },
  ],
};

export function cycleOf(S, now) {
  const n = new Date(now);
  let a = payDate(S.payday, n.getFullYear(), n.getMonth());
  if (a > n) a = payDate(S.payday, n.getFullYear(), n.getMonth() - 1);
  return [a, payDate(S.payday, a.getFullYear(), a.getMonth() + 1)];
}

export function payoffText(debt, drate) {
  if (debt <= 0) return "🎉 Debt-free";
  if (drate >= 0) return "Your debt is not shrinking at this rate";
  const d = debt / (-drate * 86400);
  return `Debt-free in ${num(d)} days` + (d >= 45 ? ` (≈ ${dec1(d / 30.44)} months)` : "") + ` · ${dateS(Date.now() + d * 864e5, { month: "short", year: "numeric" })}`;
}

export function recoveryText(bal, rate) {
  if (bal >= 0) return "";
  if (rate <= 0) return "Days until net balance: never at the current rate (bills ≥ salary)";
  const d = -bal / (rate * 86400);
  return `Days until net balance: ${d < 1 ? "< 1 day" : d.toFixed(1) + " days"} · back to $0 on ${dateS(Date.now() + d * 864e5, { month: "short", day: "numeric" })}`;
}

export function calc(S, now = Date.now()) {
  const [a, b] = cycleOf(S, now);
  const tot = (b - a) / 1000, el = (now - a) / 1000, k = mi(a);
  const sal = +S.salary || 0;
  const bills = S.tx.filter((t) => t.type === "bill").reduce((s, t) => s + t.amt, 0);
  const inc = (sal * el) / tot, bil = (bills * el) / tot;
  // one-time purchases / extra income belong to the cycle they were made in; each cycle's counter starts at 0
  const inCyc = (t) => t.id >= a.getTime() && t.id < b.getTime();
  const purchases = S.tx.filter((t) => t.type === "purchase" && inCyc(t)).reduce((s, t) => s + t.amt, 0);
  const incomeX = S.tx.filter((t) => t.type === "in" && inCyc(t)).reduce((s, t) => s + t.amt, 0);
  const txs = incomeX - purchases;

  // ---- debts: installments / credit payments pay them off; a shortfall is added to "Borrowed money" ----
  const credits = S.tx.filter((t) => t.type === "credit");
  const pays = (id, kk) => credits.filter((t) => t.debt === id && t.skip !== kk).reduce((s, t) => s + t.amt, 0); // skipped months excluded
  const ds = S.debts.map((x) => {
    const pay0 = credits.filter((t) => t.debt === x.id).reduce((s, t) => s + t.amt, 0);
    const borrowed = x.kind === "borrowed";
    return { x, pay0, pc: pays(x.id, k), borrowed, on: borrowed || pay0 > 0 || (+x.bal || 0) > 0, share: borrowed ? 1 : 0 };
  });
  const base = ds.map((o) => +o.x.bal || 0); // balance at the start of each debt's stored cycle
  const k0 = mi(new Date(S.debtCycle || a));
  for (let kk = k0; kk < k && kk < k0 + 600; kk++) {
    const P = ds.reduce((s, o) => s + pays(o.x.id, kk), 0);
    const add = Math.max(0, bills + P - sal);
    ds.forEach((o, j) => { base[j] = Math.max(0, base[j] - pays(o.x.id, kk) + add * o.share); });
  }
  const Pc = ds.reduce((s, o) => s + o.pc, 0);
  const addT = Math.max(0, bills + Pc - sal);
  let paidSum = 0, addedSum = 0, peSum = 0, debtSum = 0;
  const debts = ds.map((o, j) => {
    const added = o.on ? (addT * o.share * el) / tot : 0;
    const paid = o.on ? Math.min((o.pc * el) / tot, base[j] + added) : 0;
    const debt = o.on ? Math.max(0, base[j] + added - paid) : 0;
    const pe = o.on && debt > 0 ? o.pc : 0;
    paidSum += paid; addedSum += added; peSum += pe; debtSum += debt;
    const limit = +o.x.limit || 0, total = +o.x.total || 0;
    return {
      id: o.x.id, kind: o.x.kind, name: o.x.name, on: o.on, base: base[j], added, paid, debt, pe, pay0: o.pay0, pc: o.pc,
      skipped: o.pc < o.pay0, share: o.share, limit, total, installment: +o.x.installment || 0,
      avail: Math.max(0, limit - debt), usedPct: limit > 0 ? Math.min(100, (debt / limit) * 100) : 0,
      loanPaid: Math.max(0, total - debt), loanPct: total > 0 ? Math.min(100, (Math.max(0, total - debt) / total) * 100) : 0,
      show: o.borrowed ? debt > 0.005 : o.on,
    };
  });
  const hasBorrow = ds.some((o) => o.borrowed);
  const deficit = Math.max(0, bills + peSum - sal); // income does not cover bills + payments
  debts.forEach((o) => {
    o.def = deficit * o.share;
    o.drate = o.on ? (-o.pe + o.def) / tot : 0;
    o.payoff = o.kind === "borrowed" ? "No immediate obligations — pay it back whenever you can." : payoffText(o.debt, o.drate);
  });

  const net = (sal - bills - peSum) / tot; // can be negative: the real shortfall
  const rate = hasBorrow ? Math.max(0, net) : net;
  const speed = sal > 0 ? Math.max(-1, Math.min(1, (sal - bills - peSum) / sal)) : net < 0 ? -1 : 0;
  const bal = inc - bil - paidSum + addedSum + txs;

  // ---- goals: funded in the order listed ----
  let cum = 0;
  const goals = S.goals.map((g) => {
    const tgt = +g.target || 0, sv = +g.saved || 0, need = Math.max(0, tgt - sv), prev = cum;
    cum += need;
    const cur = sv + Math.min(need, Math.max(0, bal - prev)), rem = cum - bal;
    let out = "–", sub = "";
    if (tgt <= 0) { out = f(sv); sub = g.auto ? "Savings · leftover money lands here at payday." : "No target set — set one to see a projection."; }
    else if (need === 0 || rem <= 0) { out = "🎉 Goal reached"; sub = need === 0 ? "Already saved." : ""; }
    else if (rate <= 0) { out = "Not reachable"; sub = "Your bills are equal to or higher than your salary, so nothing is being saved."; }
    else {
      const days = rem / (rate * 86400);
      out = days < 1 ? Math.max(1, Math.ceil(days * 24)) + " hours" : num(days) + " days";
      sub = (days >= 45 ? `≈ ${dec1(days / 30.44)} months · ` : "") + `Reached around ${dateS(now + days * 864e5, { day: "numeric", month: "short", year: "numeric" })} · ${f(rem)} to go`;
    }
    return { id: g.id, name: g.name, target: tgt, cur, pct: tgt > 0 ? Math.min(100, Math.max(0, (cur / tgt) * 100)) : 0, out, sub };
  });

  return {
    key: k, start: a, next: b, tot, el, pct: (el / tot) * 100, sal, bills, billsTotal: bills + Pc,
    inc, bil, bal, rate, net, speed, rec: recoveryText(bal, rate), purchases, incomeX,
    debts, goals, hasBorrow, needBorrow: deficit > 0 && !hasBorrow, deficit, paidSum, addedSum, debtSum, Pc,
    projected: bal + rate * (tot - el), // available money expected at payday
  };
}

// fold finished cycles into each debt's stored balance
function foldDebts(S, now) {
  const c = calc(S, now);
  return { ...S, debtCycle: c.start.getTime(), debts: S.debts.map((x, j) => ({ ...x, bal: c.debts[j].base })) };
}

// money left at payday goes to the goals in order; extra goes to a savings item (created if needed).
// a negative close is taken back from the goals, last goal first.
function allocate(goals, amount) {
  const gs = goals.map((g) => ({ ...g }));
  const moved = [];
  if (amount > 0) {
    let rem = amount;
    for (const g of gs) {
      const tgt = +g.target || 0;
      if (tgt <= 0 || rem <= 0) continue;
      const give = Math.min(Math.max(0, tgt - (+g.saved || 0)), rem);
      if (give > 0) { g.saved = (+g.saved || 0) + give; rem -= give; moved.push({ name: g.name, amt: give }); }
    }
    if (rem > 0) {
      let sv = gs.find((g) => !(+g.target > 0));
      if (!sv) { sv = { id: Date.now() + gs.length, name: "Savings", target: 0, saved: 0, auto: true }; gs.push(sv); }
      sv.saved = (+sv.saved || 0) + rem;
      moved.push({ name: sv.name || "Savings", amt: rem });
    }
  } else if (amount < 0) {
    let rem = -amount;
    for (let i = gs.length - 1; i >= 0 && rem > 0; i--) {
      const take = Math.min(+gs[i].saved || 0, rem);
      if (take > 0) { gs[i].saved -= take; rem -= take; moved.push({ name: gs[i].name, amt: -take }); }
    }
  }
  return { goals: gs, moved };
}

// call before every change and when the app opens: closes every pay cycle that has ended
export function settle(S, now = Date.now()) {
  const curKey = mi(cycleOf(S, now)[0]);
  if (S.cycleKey == null) return { ...foldDebts(S, now), cycleKey: curKey, cycles: S.cycles || [] };
  let s = S;
  for (let i = 0; s.cycleKey < curKey && i < 600; i++) {
    const key = s.cycleKey, y = Math.floor(key / 12), m = key % 12;
    const a = payDate(s.payday, y, m), b = payDate(s.payday, y, m + 1);
    const c = calc(s, b.getTime() - 1); // the cycle at its last second
    const closing = Math.round(c.bal);
    const { goals, moved } = allocate(s.goals, Math.max(0, closing));
    const dn = (id) => s.debts.find((d) => d.id === id)?.name || "Debt";
    const items = s.tx // snapshot of this cycle's movements, so the history never changes
      .filter((t) => t.type === "bill" || t.type === "credit" || (t.id >= a.getTime() && t.id < b.getTime()))
      .map((t) => ({
        type: t.type, label: t.label, amt: t.amt,
        ts: t.type === "purchase" || t.type === "in" ? t.id : undefined,
        debt: t.type === "credit" ? dn(t.debt) : undefined,
        skipped: t.type === "credit" && t.skip === key,
      }));
    s = foldDebts({ ...s, goals }, b.getTime());
    if (closing < 0) { // overspent: the missing money is borrowed
      const ds = s.debts.some((d) => d.kind === "borrowed") ? s.debts : [...s.debts, borrowedDebt()];
      s = { ...s, debts: ds.map((d) => (d.kind === "borrowed" ? { ...d, bal: (+d.bal || 0) - closing } : d)) };
      moved.push({ name: "Added to Borrowed money", amt: -closing });
    }
    s = {
      ...s,
      cycleKey: key + 1,
      cycles: [...(s.cycles || []), { key, start: a.getTime(), end: b.getTime(), salary: c.sal, bills: c.billsTotal, billsOnly: c.bills, credit: c.Pc, purchases: c.purchases, income: c.incomeX, debtPaid: c.paidSum, added: c.addedSum, closing, moved, items }],
    };
  }
  return { ...foldDebts(s, now), cycleKey: curKey };
}

// the user types a debt's balance as of NOW; store it as the balance at payday
export function debtBalPatch(S, id, v) {
  const c = calc(S);
  return S.debts.map((x) => {
    if (x.id !== id) return x;
    const d = c.debts.find((o) => o.id === id);
    return { ...x, bal: Math.max(0, v - (d.added - d.paid)) };
  });
}

export const BORROWED_ID = -1;
const borrowedDebt = () => ({ id: BORROWED_ID, kind: "borrowed", name: "Borrowed money", bal: 0 });

// keeps derived data in order: every installment is a monthly movement, and a shortfall creates "Borrowed money"
export function sync(S) {
  let s = S;
  const want = s.debts.filter((d) => d.kind !== "borrowed" && +d.installment > 0);
  const ids = new Set(want.map((d) => `inst-${d.id}`));
  let tx = s.tx.filter((t) => !t.auto || ids.has(t.id));
  want.forEach((d) => {
    const id = `inst-${d.id}`, label = `${d.name || "Debt"} · installment`, amt = +d.installment;
    const old = tx.find((t) => t.id === id);
    if (!old) tx = [...tx, { id, type: "credit", debt: d.id, label, amt, auto: true }];
    else if (old.amt !== amt || old.label !== label || old.debt !== d.id) tx = tx.map((t) => (t === old ? { ...t, amt, label, debt: d.id } : t));
  });
  if (tx.length !== s.tx.length || tx.some((t, i) => t !== s.tx[i])) s = { ...s, tx };
  if (calc(s).needBorrow) s = { ...s, debts: [...s.debts, borrowedDebt()] };
  return s;
}

// numbers behind a cycle card in the History tab (works for closed cycles and for the open one)
export function cycleSummary(cy, open = false) {
  const income = (cy.salary || 0) + (cy.income || 0);
  const spent = (cy.bills || 0) + (cy.purchases || 0);
  const rows = [["Salary", f(cy.salary || 0), "pos"]];
  if (cy.income > 0) rows.push(["Extra income", f(cy.income), "pos"]);
  rows.push(["Bills", f(-(cy.billsOnly ?? cy.bills ?? 0)), "neg"]);
  if (cy.credit > 0) rows.push(["Credit payments", f(-cy.credit), "neg"]);
  if (cy.purchases > 0) rows.push(["Purchases", f(-cy.purchases), "neg"]);
  if (cy.added > 0) rows.push(["Shortfall added to debt", f(cy.added), ""]);
  rows.push([open ? "Balance so far" : "Balance at close", f(cy.closing || 0), (cy.closing || 0) < 0 ? "neg" : "pos"]);
  return { income, spent, rows };
}

// the open cycle, shaped like a closed one
export function openCycle(c) {
  return { salary: c.inc, income: c.incomeX, billsOnly: c.bil, credit: c.paidSum, bills: c.bil + c.paidSum, purchases: c.purchases, added: c.addedSum, closing: c.bal, moved: [] };
}

// the movements of a closed cycle, grouped and formatted for a read-only list
export function cycleGroups(cy) {
  const it = cy.items || [];
  const g = (type, title, icon, sign) => ({
    title,
    rows: it.filter((x) => x.type === type).map((x) => ({
      label: x.label,
      sub: type === "credit" ? `${x.debt || "Debt"}${x.skipped ? " · skipped this month" : " · monthly"}` : x.ts ? new Date(x.ts).toLocaleDateString([], { day: "numeric", month: "short" }) : "Monthly bill",
      amt: (sign < 0 ? "-" : "+") + f(x.amt), cls: sign < 0 ? "neg" : "pos", skipped: !!x.skipped, icon,
    })),
  });
  return [g("in", "Extra income", "↓", 1), g("bill", "Bills", "↻", -1), g("credit", "Credit payments", "💳", -1), g("purchase", "Purchases", "↑", -1)].filter((x) => x.rows.length);
}
