// Shared calculation logic (pure functions). Everything is counted from payday.
export const KEY = "cashflow-clp-v9";

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
const sumOf = (arr) => arr.reduce((s, t) => s + t.amt, 0);
const bounds = (S, kk) => {
  const y = Math.floor(kk / 12), m = kk % 12;
  return [payDate(S.payday, y, m).getTime(), payDate(S.payday, y, m + 1).getTime()];
};

// example history: the 4 pay cycles before the current one
function sampleCycles() {
  const now = new Date(), k = mi(now);
  const DAY = 86400000;
  // each: [extra income, cash purchases, purchases charged to the card, debt payments]
  const rows = [
    [null, 0, [["Groceries", 120000], ["Transport", 40000], ["Dining out", 50000]], [], null],
    ["Freelance project", 80000, [["Groceries", 130000], ["Gifts", 60000]], [["Clothes", 150000]], null],
    [null, 0, [["Groceries", 95000], ["Pharmacy", 25000]], [], 100000],
    [null, 0, [["Groceries", 110000], ["Car repair", 120000], ["Dining out", 45000]], [], null],
  ];
  return rows.map(([incLabel, income, cash, card, payment], i) => {
    const key = k - 4 + i, y = Math.floor(key / 12), m = key % 12;
    const start = payDate(1, y, m).getTime();
    const purchasesCash = cash.reduce((t, b) => t + b[1], 0), cardCharged = card.reduce((t, b) => t + b[1], 0);
    const payments = payment || 0;
    const closing = 1200000 + income - 540000 - 150000 - purchasesCash - payments;
    const items = [
      { type: "bill", label: "Rent", amt: 450000 },
      { type: "bill", label: "Utilities", amt: 60000 },
      { type: "bill", label: "Subscriptions", amt: 30000 },
      { type: "credit", label: "Car loan · installment", amt: 150000, debt: "Car loan", skipped: false },
      ...(income ? [{ type: "in", label: incLabel, amt: income, ts: start + 9 * DAY }] : []),
      ...cash.map(([label, amt], j) => ({ type: "purchase", label, amt, ts: start + (3 + j * 7) * DAY })),
      ...card.map(([label, amt]) => ({ type: "purchase", label, amt, ts: start + 12 * DAY, card: "Credit card" })),
      ...(payments ? [{ type: "pay", label: "Credit card payment", amt: payments, ts: start + 20 * DAY, debt: "Credit card" }] : []),
    ];
    return {
      key, start, end: payDate(1, y, m + 1).getTime(),
      salary: 1200000, bills: 690000, billsOnly: 540000, credit: 150000,
      purchases: purchasesCash + cardCharged, purchasesCash, cardCharged, payments, spending: 690000 + purchasesCash + cardCharged,
      income, debtPaid: 150000 + payments, added: 0, closing, moved: [{ name: "Vacation", amt: closing }], items,
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
  debts: [
    { id: 1, kind: "card", name: "Credit card", bal: 1800000, limit: 3000000 },
    { id: 2, kind: "loan", name: "Car loan", bal: 2700000, count: 24, installment: 150000 }, // 6 of 24 installments already paid
  ],
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

/*
  Movement types
    bill      monthly, spread over the cycle. `card` = charged to that credit card instead of cash
    purchase  one-time. `card` = charged to that credit card (adds to its used credit, no cash out)
    pay       one-time payment to a debt (card, loan or Borrowed money): cash out, debt down
    credit    loan installment (created automatically while the loan is active), can be skipped per month
    in        one-time extra income
*/
export function calc(S, now = Date.now(), _atEnd = false) {
  const [a, b] = cycleOf(S, now);
  const A = a.getTime(), B = b.getTime();
  const tot = (B - A) / 1000, el = (now - A) / 1000, k = mi(a);
  const sal = +S.salary || 0;
  const tx = S.tx;
  const inC = (t, lo = A, hi = B) => t.id >= lo && t.id < hi; // one-time items belong to the cycle they were made in

  const bills = sumOf(tx.filter((t) => t.type === "bill" && !t.card)); // monthly bills paid with cash
  const cardBills = sumOf(tx.filter((t) => t.type === "bill" && t.card));
  const cardBillsOf = (id) => sumOf(tx.filter((t) => t.type === "bill" && t.card === id));
  const buys = tx.filter((t) => t.type === "purchase" && inC(t));
  const purchasesCash = sumOf(buys.filter((t) => !t.card));
  const purchasesCard = sumOf(buys.filter((t) => t.card));
  const incomeX = sumOf(tx.filter((t) => t.type === "in" && inC(t)));
  const payOne = sumOf(tx.filter((t) => t.type === "pay" && inC(t)));
  const inc = (sal * el) / tot, bil = (bills * el) / tot;
  const txs = incomeX - purchasesCash - payOne; // one-time cash movements of this cycle

  // ---- debts ----
  const credits = tx.filter((t) => t.type === "credit");
  const pays = (id, kk) => sumOf(credits.filter((t) => t.debt === id && t.skip !== kk)); // loan installments, skipped months excluded
  const ds = S.debts.map((x) => {
    const pay0 = sumOf(credits.filter((t) => t.debt === x.id));
    const borrowed = x.kind === "borrowed", card = x.kind === "card";
    return { x, pay0, pc: pays(x.id, k), borrowed, on: borrowed || card || pay0 > 0 || (+x.bal || 0) > 0, share: borrowed ? 1 : 0 };
  });
  const base = ds.map((o) => +o.x.bal || 0); // balance at the start of each debt's stored cycle
  const k0 = mi(new Date(S.debtCycle || A));
  for (let kk = k0; kk < k && kk < k0 + 600; kk++) { // fold the finished cycles
    const [lo, hi] = bounds(S, kk);
    const P = ds.reduce((s, o) => s + pays(o.x.id, kk), 0);
    const add = Math.max(0, bills + P - sal);
    ds.forEach((o, j) => {
      const id = o.x.id;
      const ch = sumOf(tx.filter((t) => t.type === "purchase" && t.card === id && inC(t, lo, hi))) + cardBillsOf(id);
      const po = sumOf(tx.filter((t) => t.type === "pay" && t.debt === id && inC(t, lo, hi)));
      base[j] = Math.max(0, base[j] - pays(id, kk) - po + ch + add * o.share);
    });
  }
  const Pc = ds.reduce((s, o) => s + o.pc, 0);
  const addT = Math.max(0, bills + Pc - sal);
  let instSum = 0, addedSum = 0, peSum = 0, debtSum = 0, oneSum = 0;
  const debts = ds.map((o, j) => {
    const id = o.x.id;
    const added = o.on ? (addT * o.share * el) / tot : 0;
    const charged = sumOf(buys.filter((t) => t.card === id)); // charges show up the moment you add them; monthly bills charged to a card are added at payday
    const owed0 = base[j] + added + charged;
    const one = Math.min(sumOf(tx.filter((t) => t.type === "pay" && t.debt === id && inC(t))), owed0); // one-time payments
    // STATUS of the debt: it only changes at payday (installments, monthly card bills) or when you charge / prepay
    const debt = o.on ? Math.max(0, owed0 - one) : 0;
    const inst = o.on ? Math.min((o.pc * el) / tot, debt) : 0; // cash paid toward this cycle's installment, second by second
    const pe = o.on && debt > 0 ? o.pc : 0;
    instSum += inst; addedSum += added; peSum += pe; debtSum += debt; oneSum += one;
    const limit = +o.x.limit || 0, count = +o.x.count || 0, instAmt = +o.x.installment || 0, total = count * instAmt;
    return {
      id, kind: o.x.kind, name: o.x.name, on: o.on, base: base[j], added, charged, pendingBills: cardBillsOf(id), one, inst, paid: inst + one, debt, pe,
      pay0: o.pay0, pc: o.pc, skipped: o.pc < o.pay0, share: o.share,
      limit, avail: Math.max(0, limit - debt), usedPct: limit > 0 ? Math.min(100, (debt / limit) * 100) : 0,
      count, installment: instAmt, total, loanPaid: Math.max(0, total - debt), loanPct: total > 0 ? Math.min(100, (Math.max(0, total - debt) / total) * 100) : 0,
      instN: instAmt > 0 ? Math.min(count, Math.max(0, Math.floor((total - debt) / instAmt + 1e-6))) : 0,
      show: o.borrowed ? debt > 0.005 : o.card ? true : o.pay0 > 0 || debt > 0.005,
    };
  });
  const hasBorrow = ds.some((o) => o.borrowed);
  const deficit = Math.max(0, bills + peSum - sal); // income does not cover bills + installments
  debts.forEach((o) => {
    o.def = deficit * o.share;
    o.drate = o.on && o.kind !== "card" ? (-o.pe + o.def) / tot : 0;
    const left = o.installment > 0 && o.debt > 0.005 ? Math.ceil(o.debt / o.installment - 1e-9) : 0;
    o.payoff = o.kind === "borrowed" ? "No immediate obligations — pay it back whenever you can."
      : o.kind === "card" ? ""
      : o.debt <= 0.005 ? "🎉 Loan finished"
      : left === 0 ? "Set the installment amount to see when it ends"
      : `${left} installment${left > 1 ? "s" : ""} left · last one around ${dateS(bounds(S, k + left)[0], { month: "short", year: "numeric" })}`;
  });

  const net = (sal - bills - peSum) / tot; // can be negative: the real shortfall
  const rate = hasBorrow ? Math.max(0, net) : net;
  const bal = inc - bil - instSum + addedSum + txs;

  // ---- real speed: how fast your money really grows, averaged over the whole pay cycle ----
  // everything counts: what is already spent or earned this cycle (purchases, payments, extra income)
  // plus the bills and installments still to come. Money borrowed to cover a shortfall is NOT counted as income.
  const realEnd = bal - addedSum + net * (tot - el); // cash you would end the cycle with, without borrowing
  const speedV = realEnd / tot; // CLP per second
  const speedMax = (sal + incomeX) / tot; // max speed: all income, nothing paid
  const speed = speedMax > 0 ? Math.max(-1, Math.min(1, speedV / speedMax)) : speedV < 0 ? -1 : 0;

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

  const purchasesAll = purchasesCash + purchasesCard;
  // projected at payday = the exact balance this cycle would close with if nothing else changes
  // (same calculation as the closing, evaluated at the cycle's last second)
  const atEnd = _atEnd || now >= B - 1 ? null : calc(S, B - 1, true);
  return {
    key: k, start: a, next: b, tot, el, pct: (el / tot) * 100, sal,
    bills, cardBills, billsTotal: bills + Pc, // cash bills (+ loan installments)
    purchasesCash, purchasesCard, purchasesAll, cardCharged: purchasesCard + cardBills, payOne, incomeX,
    spending: bills + cardBills + Pc + purchasesAll, // everything spent this cycle, whoever pays it
    inc, bil, bal, rate, net, speed, speedV, speedMax, rec: recoveryText(bal, rate),
    debts, goals, hasBorrow, needBorrow: deficit > 0 && !hasBorrow, deficit, paidSum: instSum, addedSum, oneSum, debtSum, Pc,
    projected: atEnd ? atEnd.bal : bal, // available money expected at payday
    projBorrow: atEnd ? atEnd.addedSum : addedSum, // part of the shortfall that will be borrowed by then
  };
}

export const BORROWED_ID = -1;
const borrowedDebt = () => ({ id: BORROWED_ID, kind: "borrowed", name: "Borrowed money", bal: 0 });

// keeps derived data in order: an active loan always has its monthly installment as a movement,
// and a shortfall creates "Borrowed money"
export function sync(S) {
  let s = S;
  const c0 = calc(s);
  const active = new Set(c0.debts.filter((d) => d.kind === "loan" && d.debt > 0.005).map((d) => d.id));
  const want = s.debts.filter((d) => d.kind === "loan" && +d.installment > 0 && active.has(d.id));
  const ids = new Set(want.map((d) => `inst-${d.id}`));
  let tx = s.tx.filter((t) => !t.auto || ids.has(t.id));
  want.forEach((d) => {
    const id = `inst-${d.id}`, label = `${d.name || "Loan"} · installment`, amt = +d.installment;
    const old = tx.find((t) => t.id === id);
    if (!old) tx = [...tx, { id, type: "credit", debt: d.id, label, amt, auto: true }];
    else if (old.amt !== amt || old.label !== label || old.debt !== d.id) tx = tx.map((t) => (t === old ? { ...t, amt, label, debt: d.id } : t));
  });
  if (tx.length !== s.tx.length || tx.some((t, i) => t !== s.tx[i])) s = { ...s, tx };
  if (calc(s).needBorrow) s = { ...s, debts: [...s.debts, borrowedDebt()] };
  return s;
}

// fold finished cycles into each debt's stored balance
function foldDebts(S, now) {
  const c = calc(S, now);
  return { ...S, debtCycle: c.start.getTime(), debts: S.debts.map((x, j) => ({ ...x, bal: c.debts[j].base })) };
}

// money left at payday goes to the goals in order; extra goes to a savings item (created if needed)
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
  }
  return { goals: gs, moved };
}

// call before every change and when the app opens: closes every pay cycle that has ended
export function settle(S, now = Date.now()) {
  const curKey = mi(cycleOf(S, now)[0]);
  if (S.cycleKey == null) return { ...foldDebts(S, now), cycleKey: curKey, cycles: S.cycles || [] };
  let s = S;
  for (let i = 0; s.cycleKey < curKey && i < 600; i++) {
    const key = s.cycleKey, [lo, hi] = bounds(s, key);
    const c = calc(s, hi - 1); // the cycle at its last second
    const closing = Math.round(c.bal);
    const { goals, moved } = allocate(s.goals, Math.max(0, closing));
    const dn = (id) => s.debts.find((d) => d.id === id)?.name || "Debt";
    const items = s.tx // snapshot of this cycle's movements, so the history never changes
      .filter((t) => t.type === "bill" || t.type === "credit" || (t.id >= lo && t.id < hi))
      .map((t) => ({
        type: t.type, label: t.label, amt: t.amt,
        ts: ["purchase", "in", "pay"].includes(t.type) ? t.id : undefined,
        debt: t.type === "credit" || t.type === "pay" ? dn(t.debt) : undefined,
        card: t.card ? dn(t.card) : undefined,
        skipped: t.type === "credit" && t.skip === key,
      }));
    s = foldDebts({ ...s, goals }, hi);
    if (closing < 0) { // overspent: the missing money is borrowed
      const ds = s.debts.some((d) => d.kind === "borrowed") ? s.debts : [...s.debts, borrowedDebt()];
      s = { ...s, debts: ds.map((d) => (d.kind === "borrowed" ? { ...d, bal: (+d.bal || 0) - closing } : d)) };
      moved.push({ name: "Added to Borrowed money", amt: -closing });
    }
    s = {
      ...s,
      cycleKey: key + 1,
      cycles: [...(s.cycles || []), {
        key, start: lo, end: hi, salary: c.sal, bills: c.billsTotal, billsOnly: c.bills, credit: c.Pc,
        purchases: c.purchasesAll, purchasesCash: c.purchasesCash, cardCharged: c.cardCharged, payments: c.payOne, spending: c.spending,
        income: c.incomeX, debtPaid: c.paidSum + c.oneSum, added: c.addedSum, closing, moved, items,
      }],
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
    return { ...x, bal: Math.max(0, v - (d.added + d.charged - d.one)) };
  });
}

// numbers behind a cycle card in the History tab (works for closed cycles and for the open one)
export function cycleSummary(cy, open = false) {
  const income = (cy.salary || 0) + (cy.income || 0);
  const spent = cy.spending ?? (cy.bills || 0) + (cy.purchases || 0);
  const rows = [["Salary", f(cy.salary || 0), "pos"]];
  if (cy.income > 0) rows.push(["Extra income", f(cy.income), "pos"]);
  rows.push(["Bills", f(-(cy.billsOnly ?? cy.bills ?? 0)), "neg"]);
  if (cy.credit > 0) rows.push(["Loan installments", f(-cy.credit), "neg"]);
  const cash = cy.purchasesCash ?? cy.purchases ?? 0;
  if (cash > 0) rows.push(["Purchases (cash)", f(-cash), "neg"]);
  if (cy.cardCharged > 0) rows.push(["Charged to credit cards", f(cy.cardCharged), ""]);
  if (cy.payments > 0) rows.push(["Debt payments", f(-cy.payments), "neg"]);
  if (cy.added > 0) rows.push(["Shortfall added to debt", f(cy.added), ""]);
  rows.push([open ? "Balance so far" : "Balance at close", f(cy.closing || 0), (cy.closing || 0) < 0 ? "neg" : "pos"]);
  return { income, spent, rows };
}

// the open cycle, shaped like a closed one
export function openCycle(c) {
  return {
    salary: c.inc, income: c.incomeX, billsOnly: c.bil, credit: c.paidSum, bills: c.bil + c.paidSum,
    purchases: c.purchasesAll, purchasesCash: c.purchasesCash, cardCharged: c.cardCharged, payments: c.payOne,
    spending: c.bil + c.paidSum + c.cardBills * (c.el / c.tot) + c.purchasesAll, added: c.addedSum, closing: c.bal, moved: [],
  };
}

// the movements of a closed cycle, grouped and formatted for a read-only list
export function cycleGroups(cy) {
  const it = cy.items || [];
  const g = (type, title, icon, sign) => ({
    title,
    rows: it.filter((x) => x.type === type).map((x) => ({
      label: x.label,
      sub: type === "credit" ? `${x.debt || "Loan"}${x.skipped ? " · skipped this month" : " · monthly"}`
        : type === "pay" ? `${x.debt || "Debt"} · ${x.ts ? new Date(x.ts).toLocaleDateString([], { day: "numeric", month: "short" }) : ""}`
        : x.card ? `Charged to ${x.card}`
        : x.ts ? new Date(x.ts).toLocaleDateString([], { day: "numeric", month: "short" }) : "Monthly bill",
      amt: (sign < 0 ? "-" : "+") + f(x.amt), cls: sign < 0 ? "neg" : "pos", skipped: !!x.skipped, icon: x.card ? "💳" : icon,
    })),
  });
  return [g("in", "Extra income", "↓", 1), g("bill", "Bills", "↻", -1), g("credit", "Loan installments", "↻", -1), g("purchase", "Purchases", "↑", -1), g("pay", "Debt payments", "⇄", -1)].filter((x) => x.rows.length);
}
