"""A network blip must not permanently halt an unattended agent."""

import socket

import main


def test_dns_failures_are_transient():
    """The exact error that halted trading for 9 days from 2026-07-13, and
    again on 2026-07-27."""
    e = Exception("[Errno 8] nodename nor servname provided, or not known")
    assert main._is_transient_connection_error(e) is True
    assert main._is_transient_connection_error(socket.gaierror(8, "nodename")) is True


def test_timeouts_and_resets_are_transient():
    for e in (TimeoutError("timed out"), ConnectionError("connection reset by peer"),
              Exception("Server disconnected without sending a response")):
        assert main._is_transient_connection_error(e) is True


def test_auth_and_schema_failures_still_halt():
    """These mean the integration is genuinely broken, not flaky."""
    for e in (Exception("401 Unauthorized"), Exception("invalid refresh token"),
              Exception("missing tool: place_equity_order")):
        assert main._is_transient_connection_error(e) is False
