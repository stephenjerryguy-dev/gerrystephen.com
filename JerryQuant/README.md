# JerryQuant

A cautious, capital-preservation-first trading assistant. It researches,
backtests, and paper trades a conservative trend-following strategy, and it
will only ever touch a real brokerage (Robinhood via MCP) after multiple
explicit, manual arming steps — with per-trade human approval on top.

It is built to behave like a disciplined quant assistant, not a gambling bot.
**Its favorite trade is no trade.**

## What it does

1. Collects daily market data (BTC, ETH, SOL via -USD pairs; SPY, QQQ) from
   yfinance — no API keys required.
2. Generates long-only swing signals from a conservative trend-following
   strategy (50/200-day MA structure, volume, volatility band, breakout or
   pullback setup, ATR-based stops, minimum 2:1 reward-to-risk).
3. Backtests across history with slippage, spread, and fees, reporting the
   full metric set (return, drawdown, win rate, profit factor, Sharpe,
   Sortino, consecutive losses, buy-and-hold comparison, and more).
4. Paper trades with the same costs and the same risk gates as live.
5. Journals **every** signal — including explicit "AVOID" decisions — and
   every trade to SQLite with full reasoning.
6. Enforces hard risk limits in code (see below) and shuts itself down when
   they are violated.
7. Produces a daily report (email if SMTP is configured in `.env`, otherwise
   terminal + markdown file) that includes a "do nothing" recommendation
   whenever no edge exists.
8. Requires explicit per-trade manual approval before any live order.

## Edge controls (added on top of the base trend follower)

These make the system more discerning without weakening any safety rule —
every new signal still passes through position sizing, exposure limits, the
drawdown guard, the kill switch, and per-trade approval.

- **Market-regime gate** (`strategy.regime`): no new longs unless the broad
  market is healthy — the benchmark (SPY) above its 200-day MA and a minimum
  fraction of the universe above their own MAs. Trend-following bleeds in
  bear/chop tapes; this keeps it flat there. The gate only ever *blocks* new
  entries; it never forces a trade and never touches open positions.
- **Smarter exits** (`strategy.trend_following`): a chandelier **trailing
  stop** that ratchets up and lets winners run (replacing the fixed target),
  a **time stop** that closes dead-money positions, and **partial
  profit-taking** that scales out a fraction at a set R multiple and moves
  the stop to breakeven.
- **Correlation-aware exposure** (`risk.correlation`): correlated names
  (BTC/ETH/SOL) share a combined **cluster cap**, and a new position that is
  highly correlated with what is already open is **sized down** — so three
  crypto names cannot quietly become one triple-sized bet.
- **Validation tooling** (`python main.py --validate`): walk-forward
  out-of-sample windows, a parameter-sensitivity sweep (curve-fit check),
  and a bootstrap Monte Carlo over the realized trades (return and
  drawdown distributions). Pure analysis — it never trades.

Each control has an `enabled` flag and conservative defaults in
`config.yaml`; turning any of them off falls back to the base behavior.

## What it does NOT do

- No high-frequency trading or scalping — it works on **daily bars**.
- No options, no margin, no leverage, no short selling.
- No revenge trading: after a drawdown halt, a human must intervene.
- No meme coins or low-liquidity tokens.
- No trading when data is missing, stale, conflicting, or implausible —
  bad data means the asset is simply not traded that day.
- Sentiment and prediction markets **never** trigger trades. They can only
  nudge confidence within a small bounded range, and a positive nudge can
  never rescue a signal that failed on its own merits.
- It places live orders ONLY when fully armed and only with per-trade
  approval. Order placement is now implemented against Robinhood's real,
  discovered MCP tool schemas (review-then-place, equities only — the
  agentic MCP exposes no crypto order tools), and still requires the
  config flag, the credentials, LIVE_APPROVED mode, and the typed `APPROVE`.
  It never guesses at an API it has not seen.

## Risk rules (enforced in code)

| Rule | Limit |
|---|---|
| Risk per trade | max 1% of account equity |
| Daily drawdown | max 5% — trading halts for the day |
| Monthly loss (testing phase) | max 3% — kill switch |
| Total drawdown | max 10% — permanent shutdown until human review |
| Single asset allocation | max 20% of portfolio |
| Crypto allocation | max 40% of portfolio |
| Open positions | max 3 |
| Risk/reward | min 2:1 |
| Confidence score | min 70/100 |
| Stop loss | mandatory — no stop, no trade |
| Liquidity | min $1M average 20-day dollar volume |
| Spread | max 0.5% |

`core/config.py` additionally enforces **hard ceilings** that `config.yaml`
cannot override (e.g. per-trade risk can never exceed 2%, manual approval
can never be disabled). Code wins over config.

## Running it from your phone (GitHub Actions)

You don't need a computer or server. Two workflows live in
`.github/workflows/` at the repo root:

- **JerryQuant Backtest** — manual. GitHub → Actions tab → "JerryQuant
  Backtest" → Run workflow. Runs the full test suite, then the real
  backtest against live Yahoo Finance data, and prints the performance
  report in the run summary.
- **JerryQuant Paper Trading** — runs the daily paper cycle automatically
  at 21:30 UTC (after US market close) and on demand. It saves the paper
  account state and trade journal back to the repo so it remembers
  positions between days, posts the daily report in the run summary, and
  emails it if email is configured (below). **Note:** the daily schedule
  only fires on the repo's default branch — merge this branch to `main`
  to activate it; manual runs work from any branch.

### Email reports (Gmail)

The system never stores your password in code. Two one-time steps, both
doable from a phone:

1. Create a Gmail **App Password**: go to
   https://myaccount.google.com/apppasswords (turn on 2-Step Verification
   first if prompted) and generate one. It's a 16-character code — this is
   NOT your normal Gmail password, and your normal password will not work.
2. Add two repository secrets: GitHub → repo → Settings → Secrets and
   variables → Actions → New repository secret:
   - `SMTP_USER` = your Gmail address
   - `SMTP_PASSWORD` = the App Password from step 1

That's it — the paper-trading workflow picks them up automatically and
emails each daily report to your Gmail. If the secrets aren't set, reports
still appear in the workflow run summary and in `logs/reports/`.

(If you instead run on your own machine, put the same values in
`JerryQuant/.env` per `.env.example`.)

## Approving live trades from your phone

Approval must go through something that knows it's *you* — never a public web
page. The supported on-the-go path is a **GitHub Environment gate** you approve
in the GitHub mobile app:

The `JerryQuant Live` workflow (`.github/workflows/jerryquant-live.yml`) runs
in two windows a day so a trend recognized at the close is placed at the open:

1. **After the US close** — a `preview` run posts the day's proposed tickets to
   the run summary (the heads-up that a trend was recognized). Places nothing.
2. **At the US open** — `propose` recomputes on fresh prices, then the `execute`
   job is gated by a GitHub Environment named `live-trading` with you as a
   **required reviewer**. It pauses and notifies you; you open the GitHub app,
   read the tickets, and tap **Approve** or **Reject**.
3. On approval, `--mode live_execute` places **exactly** the proposed tickets
   (downloaded as an artifact — not a recomputed set), re-checking the kill
   switch and the price-deviation guard at the open. A proposal older than
   `LIVE_PENDING_MAX_AGE_H` hours is refused as stale.

The live equity universe is SPY/QQQ/IWM plus the spot-crypto ETFs **IBIT**
(Bitcoin) and **ETHA** (Ethereum) — crypto exposure on the equity rails. Note
these trade equity hours, not 24/7; Robinhood's agentic MCP has no crypto order
tools, so direct 24/7 crypto is not available through this account.

One-time setup (only you can do these) is documented at the top of the workflow
file: create the `live-trading` environment with yourself as required reviewer,
and add the `ROBINHOOD_*` repository secrets. There is no "always approve" —
each run is a separate, authenticated approval, by design.

**Most tamper-resistant variant:** switch the workflow's `runs-on` to a
self-hosted runner on your own machine and point `JERRYQUANT_ENV_PATH` at a
local `.env`. Then the Robinhood token never leaves your hardware and GitHub
only provides the approval gate.

On a computer you can still approve interactively with
`python main.py --mode live_approved` (it prints each ticket and waits for you
to type `APPROVE`).

## The live test: $100 in Robinhood's agentic account

Owner decision (2026-06-12): the live test with $100 **is** the test
phase — it replaces the multi-week paper-validation gate. Backtesting and
paper trading still run in parallel (they're free), but they no longer
block going live. Everything else in the script is unchanged and still
enforced in code: per-trade manual approval, all risk limits, the kill
switch, and no trading on missing or stale data.

The connection path (all phone-doable):

1. In the Robinhood app: Agentic tab → **Connect your agent** → copy the
   MCP link (`https://agent.robinhood.com/mcp/trading`).
2. Connect that MCP server to your Claude Code environment (environment
   settings → MCP servers) or claude.ai connectors, and sign in to
   Robinhood when prompted. Claude is the agent; JerryQuant generates the
   trade ticket; you approve; the order goes through Robinhood's MCP into
   the **dedicated agentic account, separate from the rest of your
   portfolio**.
3. First connected run: `LIVE_APPROVED` mode performs **discovery only** —
   it lists Robinhood's actual MCP tools and journals them. Order
   placement is then implemented against those real schemas. Until that
   step lands, no live order can physically be sent.
4. Dry run in `LIVE_REVIEW` (full tickets, zero execution), then arm
   `LIVE_APPROVED` and approve trades one at a time by typing `APPROVE`.

Honest math for the $100 account: 1% risk per trade = $1 maximum loss per
trade, and the 20% single-asset cap = $20 maximum position. Spread and
slippage will be a meaningful share of P&L at this size — the $100 stage
proves discipline, not profits. Add money only after the rules have held:
the limits scale automatically with account size.

## Setup

```bash
cd JerryQuant
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill in only what you use; all keys optional
pytest                      # everything should pass before you run anything
```

Secrets live only in `.env` (gitignored). `.env.example` documents every
variable. Nothing is hardcoded.

## Running

### Backtest mode (the default)

```bash
python main.py                  # mode comes from config.yaml (BACKTEST)
python main.py --mode backtest
```

Fetches history for the watchlist, runs the trend-following strategy through
the engine with costs applied, prints the full performance report, and
journals every simulated trade to `jerryquant.db`.

### Validation mode (run before trusting the edge)

```bash
python main.py --validate       # walk-forward + sensitivity + Monte Carlo
```

Pure analysis on historical data — never trades. Prints walk-forward
out-of-sample windows, a parameter-sensitivity surface (curve-fit check),
and a bootstrap Monte Carlo distribution of returns and drawdowns. Use it
to decide whether the strategy's edge is robust or fit to noise.

### Paper mode

```bash
python main.py --mode paper
```

Runs **one daily cycle**: manages open paper positions (stops, targets,
trend-break exits), evaluates new signals, executes them on the paper broker
with simulated slippage/spread/fees, journals everything, and delivers the
daily report. Paper state persists in `paper_state.json` between runs — run
it once per day (manually or via cron). It is deliberately not a tight loop.

### Live review mode

```bash
python main.py --mode live_review
```

Identical signal pipeline, but instead of executing, it renders the complete
trade ticket (asset, direction, entry, stop, target, size, max dollar loss,
risk/reward, confidence, strategy, data sources, reasons for AND against,
current exposure) for your eyes only. Nothing is ever executed in this mode.

### Live approved mode (disabled by default)

`python main.py --mode live_approved` will **refuse to run** until all of
the following are true — and there is no code path that does this for you:

1. You set `execution.live_trading_enabled: true` in `config.yaml`.
2. You provide `ROBINHOOD_MCP_URL` and `ROBINHOOD_MCP_API_KEY` in `.env`.
3. You approve each individual trade by typing `APPROVE` at the prompt
   (anything else rejects).

Even then, order placement is currently a deliberate `NotImplementedError`:
live execution will only be built after backtesting and paper trading have
been validated.

## How to stop the bot

Three ways, in increasing order of force:

1. `Ctrl+C` — it's a single-cycle CLI; there is no daemon to kill.
2. **Create a file named `HALT_TRADING.txt` in the JerryQuant directory.**
   While it exists, no order of any kind can be placed, in any mode. The
   kill switch also creates this file itself when a risk rule is violated
   (drawdown breach, stale data, unverifiable balance, sizing failure...),
   so a halt always survives restarts. Delete the file only after you
   understand why it appeared.
3. Set `mode: BACKTEST` in `config.yaml` — the default, and the only mode
   that runs while halted.

## Reports

A markdown report is written to `logs/reports/` every paper/live-review run,
covering portfolio value, open positions, closed trades, P&L, drawdown, new
signals, missed trades, risk warnings, and suggested actions. If
`SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD` are set in `.env`, it is also
emailed (default recipient is configured in `config.yaml`).

## Adding a new strategy later

1. Create `strategies/your_strategy.py` exposing
   `evaluate(df, asset, cfg) -> Optional[Signal]` (see
   `strategies/trend_following.py` for the pattern, and
   `strategies/momentum.py` for the disabled-stub pattern).
2. Return `Signal` objects with honest `reasons_for` / `reasons_against` —
   the aggregator and order manager re-check every risk gate regardless.
3. Add a config block under `strategy:` in `config.yaml`, disabled by
   default.
4. Backtest it. Then paper trade it. Only then discuss enabling it.

New strategies cannot bypass risk rules: position sizing, exposure limits,
the drawdown guard, and the kill switch sit between every signal and every
order, in every mode.

## Project layout

```
JerryQuant/
  core/            config loading + hard safety ceilings
  data_sources/    market data (yfinance), crypto, prediction markets*, sentiment*
  strategies/      trend following (live), momentum*, aggregation w/ bounded nudges
  risk/            position sizing, drawdown guard, exposure limits, kill switch
  execution/       paper broker, order manager (approval flow), Robinhood MCP (disarmed)
  backtesting/     event-driven engine (no lookahead) + performance metrics
  reports/         trade journal + daily report (email/terminal/file)
  database/        SQLite models and access
  tests/           70 tests covering every safety-critical path
  config.yaml      all tunables; conservative defaults
  .env.example     every secret the system could ever use (all optional today)
  main.py          CLI entry point

  * = research-only placeholders, cannot trigger trades by design
```

## Risk warning

This software is for research and education. Backtest results do not
predict future returns; paper results overstate live results. Markets can
gap through stops. Never trade money you cannot afford to lose, and treat
every limit in this system as a backstop — not a guarantee.
