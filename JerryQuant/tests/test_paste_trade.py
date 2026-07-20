from data_sources.paste_trade import (
    parse_best_trades,
    parse_board_payload,
    render_report,
)


HTML = """
<main>
  <article>
    <span>1</span>
    <div>
      <a href="https://app.paste.trade/s/abc-1#t-trade-1">BTC</a>
      <span>LONG</span><span>40x</span><span>@alice_trades</span>
    </div>
    <a href="https://app.paste.trade/s/abc-1?chart_from=1#t-trade-1">
      Open BTC trade source
    </a>
  </article>
  <article>
    <a href="https://app.paste.trade/s/def-2#t-trade-2">ORCL</a>
    <span>SHORT</span><span>@researcher</span>
  </article>
</main>
"""


def test_parse_public_trade_cards():
    trades = parse_best_trades(HTML)
    assert [(t.symbol, t.direction, t.leverage) for t in trades] == [
        ("BTC", "LONG", 40),
        ("ORCL", "SHORT", None),
    ]
    assert trades[0].source_handle == "@alice_trades"
    assert trades[0].trade_id == "t-trade-1"


def test_report_is_explicitly_non_executing():
    report = render_report(parse_best_trades(HTML))
    assert "No broker or wallet orders were placed" in report
    assert "not recommendations or executable tickets" in report


def test_parse_public_board_api():
    trades = parse_board_payload({"rows": [{
        "id": "abc-1",
        "source_id": "source-2",
        "ticker": "BTC",
        "display_ticker": "BTC",
        "direction": "long",
        "leverage": 40,
        "author_handle": "alice",
    }]})
    assert trades[0].trade_id == "t-abc-1"
    assert trades[0].direction == "LONG"
    assert trades[0].source_url == (
        "https://app.paste.trade/s/source-2#t-abc-1"
    )
