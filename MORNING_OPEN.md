# JerryQuant — Morning Open Runbook

A 2-minute routine to take the live agent from "idle overnight" to
"trades placed (with your approval)" at the US market open.

> **Safety reality:** the agent does NOT pre-trade. It generates tickets at
> the open from fresh data, then waits for your approval. Nothing buys on its
> own. Trying to "approve tonight" approves an empty proposal — there are no
> tickets until the morning scan runs.

---

## The schedule (already wired, times in ET)

| Time (ET) | Phase | What it does | Places orders? |
|-----------|-------|--------------|----------------|
| 8:45 AM | plan | pre-market plan, serializes tickets | ❌ no |
| 9:35 AM | scan | **open scan on fresh data — real tickets** | ❌ no |
| 12:00 PM | scan | midday re-scan | ❌ no |
| 3:45 PM | scan | pre-close scan | ❌ no |
| 4:15 PM | scan | close scan + daily report/email | ❌ no |

`execute` is a **separate, approval-gated job** — it never runs on a schedule
on its own. It only places the tickets you approved.

---

## Tonight (once — then it's set)

1. **Reviewer gate** — GitHub repo `gerrystephen.com` → Settings →
   Environments → `live-trading` → confirm **you are a Required reviewer**.
   This is the line between "waits for my tap" and "fires on its own."
2. **Trigger reliability** — GitHub cron is best-effort and often dropped.
   Make sure your external scheduler (cron-job.org, TZ America/New_York) is
   pointed at the workflow, OR plan to tap it yourself in the morning.
3. **Kill switch check** — no `JerryQuant/HALT_TRADING.txt` present
   (its absence = trading allowed). To STOP everything instantly, create it.

## At the open (~9:35 ET)

1. If relying on yourself for the trigger:
   ```bash
   GITHUB_DISPATCH_TOKEN=<your_pat> ./scripts/trigger_live_agent.sh scan
   ```
2. Wait for the **email** (to stephenjerryguy@gmail.com) with the proposed
   tickets. Read them: asset, size, $ value, max loss.
3. If you approve: open the workflow run → the `execute` job is paused on the
   `live-trading` environment → click **Approve**. Orders place.
   If you don't: do nothing. It stays in cash.

## What deploys (current allocation, $100 account)

100% cash today → target mix, as small fractional buys:

`SPY 37 · QQQ 19 · IWM 9 · GLD 14 · TLT 14 · IBIT 5 · ETHA 2`

(2% cash buffer left uninvested; only rebalances when a holding drifts >5%.)

---

## Hard safety facts (cannot be changed from config)

- Every live order requires explicit approval (`require_manual_approval` is
  un-disableable in code).
- Unattended auto-execution, if ever enabled, is capped tiny ($50) with a
  daily-loss limit — and is OFF.
- `HALT_TRADING.txt` halts everything except backtests.

## Emergency stop

```bash
echo "halt $(date)" > JerryQuant/HALT_TRADING.txt
```
Removes the agent's ability to trade until you delete the file.
