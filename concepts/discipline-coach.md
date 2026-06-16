# Discipline Coach — concept

*Working name: "Anchor" (keeps you anchored to your plan). Alternatives:
JerryCoach, Backstop, Compass, Second Look.*

A second agent for the `/agents` hub. **It does not trade.** It watches how
*you* trade and keeps you from the behavioral mistakes that actually cost
regular investors money.

---

## The insight

For most people the money isn't lost picking the wrong stock — it's lost in
behavior: panic-selling the dip, FOMO-chasing a runner, overtrading,
revenge-trading after a loss, dumping everything into one hot name. Study
after study (e.g. DALBAR) shows the average investor trails the very funds
they own by several percent a year, purely from bad timing — the "behavior
gap."

So the Coach's edge is **not alpha** (nobody has reliable retail alpha — see
JerryQuant's own honest backtests). Its edge is **closing the behavior gap.**
That's an honest product: it genuinely helps, it doesn't promise to beat the
market, and it's mostly analysis of *your own* decisions.

## What it does

1. **The "second look."** Before/around a trade you make, it gives one calm,
   factual flag — never a block, just a pause:
   - *Concentration:* "this puts 55% of you in tech / one name."
   - *Chasing:* "you're buying after a +25% run, well above its average."
   - *Panic:* "you're selling into a 12% drawdown — this looks like a
     stop-panic. Want a 1-hour cooling-off timer?"
   - *Overtrading:* "8 trades this week vs your usual 1."
   - *Revenge trade:* "this is right after a loss."
   - *Size:* "this risks ~9% of the account on one position."
2. **Your plan, enforced.** You set the rules once (max position %, max in one
   name/sector, max trades/week, cooling-off window, "don't buy within X% of a
   3-month high"). It flags violations against *your own* rules.
3. **The pattern mirror.** It journals every decision and its outcome, then
   shows you your tendencies: "you sell winners early and hold losers," "you
   panic-sold 3 times this year — all 3 recovered." Self-awareness is the edge.
4. **The honest mirror.** Your actual return vs. simply holding a broad index —
   the behavior gap, quantified. Most apps hide this; the Coach leads with it.
5. **Rewards discipline, not activity.** Streaks for sticking to the plan,
   credit for "no-trade" days. (JerryQuant's "favorite trade is no trade,"
   applied to *you*.)

## How it works (read-only by design)

The Coach connects to Robinhood with **only the read tools** the MCP already
exposes — `get_equity_positions`, `get_equity_orders`, `get_portfolio`,
`get_equity_quotes`. It can *see* your positions and orders; it physically
**cannot place, cancel, or move anything** (it never touches `place_equity_order`).
That read-only posture is the whole safety story.

Realistic trigger model: true pre-trade interception isn't possible (the Coach
isn't in Robinhood's order flow). So it works two ways:
- **On demand:** "Anchor, I'm thinking of buying $X of QQQ — second look?" →
  it runs the checks before you act.
- **Near-real-time:** it reads new/pending orders shortly after you place them
  and coaches immediately (and notes whether an order is still cancelable).
- **Periodic:** a weekly "behavior report" pushed to your phone.

## What it reuses from JerryQuant

A lot — this is why it's cheap to build:
- `risk/correlation.py` and `risk/exposure_limits.py` — concentration &
  correlation checks.
- `risk/position_sizing.py` — "how much are you really risking" math.
- `risk/regime_filter.py` / market data — "you're buying an extended market."
- the journal/`database` — logging your decisions and outcomes.
- the `/agents` hub, the ntfy push, and the validation/honesty ethos.

## How it differs from JerryQuant

| | JerryQuant | Discipline Coach |
|---|---|---|
| Acts on the market | Yes (with your approval) | **Never** — read-only |
| Decisions | Its own (rules-based) | **Yours** — it reacts to them |
| Job | Trade a strategy safely | Keep *you* disciplined |
| Risk if it breaks | Could place a bad order | Worst case: a wrong nudge |

## Honest boundaries (what it does NOT do)

- It does **not** auto-trade or place orders.
- It does **not** promise higher returns.
- It avoids **"buy/sell this specific security" recommendations** — that's
  investment advice, with regulatory weight. The Coach speaks to *your
  behavior, concentration, and plan adherence* (analytics), not "buy NVDA."
- For personal use this is a tool. If it's ever offered to **other people**,
  it needs a real legal review (advice/RIA rules can apply depending on
  framing) — same caveat as any money app.

## Build phases

1. **MVP (personal, read-only):** connect read tools, implement the core
   checks (concentration, chasing, size, overtrading), an on-demand "second
   look" command, and a weekly behavior report. Reuse JerryQuant's risk engine.
2. **Mirror:** decision/outcome journaling, pattern detection, the honest
   index benchmark, phone nudges.
3. **Product (optional):** multi-user, auth, and the regulatory work — only if
   you decide to take it past personal use.

## Open questions to shape

- **Name** — Anchor? Something else?
- **Trigger** — happy with on-demand + near-real-time + weekly, given true
  pre-trade interception isn't possible?
- **Which behaviors first** — which of the mistakes above bite *you* most?
- **Scope** — personal tool, or building toward something others use (which
  changes the legal/effort picture a lot)?
