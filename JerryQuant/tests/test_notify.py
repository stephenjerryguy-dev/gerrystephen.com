"""Tests for the ntfy push-notification helper."""

from reports import notify


def test_no_op_without_topic(monkeypatch):
    monkeypatch.delenv("JERRYQUANT_NTFY_TOPIC", raising=False)
    assert notify.push_ticket("t", "m") is False


def test_pushes_when_topic_set(monkeypatch):
    monkeypatch.setenv("JERRYQUANT_NTFY_TOPIC", "my-secret-topic")
    monkeypatch.setenv("GITHUB_REPOSITORY", "stephenjerryguy-dev/gerrystephen.com")
    monkeypatch.setenv("GITHUB_RUN_ID", "123")
    monkeypatch.setenv("GITHUB_SERVER_URL", "https://github.com")
    sent = {}

    class FakeResp:
        pass

    def fake_post(url, data=None, headers=None, timeout=None):
        sent["url"] = url
        sent["data"] = data
        sent["headers"] = headers
        return FakeResp()

    import httpx
    monkeypatch.setattr(httpx, "post", fake_post)
    ok = notify.push_ticket("JerryQuant", "BUY SPY", )
    assert ok is True
    assert sent["url"] == "https://ntfy.sh/my-secret-topic"
    assert b"BUY SPY" in sent["data"]
    # links to the GitHub run for approval
    assert sent["headers"]["Click"].endswith("/actions/runs/123")


def test_push_never_raises_on_network_error(monkeypatch):
    monkeypatch.setenv("JERRYQUANT_NTFY_TOPIC", "t")
    import httpx
    def boom(*a, **k):
        raise httpx.ConnectError("down")
    monkeypatch.setattr(httpx, "post", boom)
    assert notify.push_ticket("t", "m") is False   # swallowed, returns False


def test_summarize_actions():
    actions = [
        {"kind": "entry", "symbol": "SPY", "units": 0.05, "entry": 754.0},
        {"kind": "exit", "symbol": "TLT", "units": 0.1},
    ]
    s = notify.summarize_actions(actions)
    assert "BUY SPY" in s and "SELL TLT" in s
