"""TCP socket client to Ableton MCP server (port 9877)."""

from __future__ import annotations

import json
import socket


ABLETON_HOST = "127.0.0.1"
ABLETON_PORT = 9877
TIMEOUT = 5.0


def send_command(method: str, params: dict | None = None) -> dict:
    """Send a JSON-RPC style command to the Ableton MCP bridge.

    Returns the parsed response dict, or raises on failure.
    """
    payload = {"method": method}
    if params:
        payload["params"] = params

    try:
        with socket.create_connection((ABLETON_HOST, ABLETON_PORT), timeout=TIMEOUT) as sock:
            data = json.dumps(payload).encode("utf-8") + b"\n"
            sock.sendall(data)
            response = b""
            while True:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                response += chunk
                if b"\n" in response:
                    break
            return json.loads(response.decode("utf-8"))
    except (ConnectionRefusedError, TimeoutError, OSError) as exc:
        raise ConnectionError(f"Cannot connect to Ableton MCP at {ABLETON_HOST}:{ABLETON_PORT}: {exc}") from exc


def is_available() -> bool:
    """Check if the Ableton MCP bridge is reachable."""
    try:
        with socket.create_connection((ABLETON_HOST, ABLETON_PORT), timeout=1.0):
            return True
    except (ConnectionRefusedError, TimeoutError, OSError):
        return False
