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
- It does not place live orders today. The Robinhood MCP broker interface
  exists but order placement is intentionally unimplemented until
  backtesting and paper trading are validated and connection details are
  provided.

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
