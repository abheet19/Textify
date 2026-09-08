"""Opt-in actual browser driving the same isolated PostgreSQL fixture."""
import os
from pathlib import Path
import socket
import subprocess
import threading
import time

import pytest
import uvicorn


@pytest.mark.skipif(os.getenv("TEXTIFY_RUN_BROWSER_TESTS") != "1", reason="Opt in with TEXTIFY_RUN_BROWSER_TESTS=1 and a Playwright installation")
def test_browser_workflow(workspace):
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    port = listener.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(workspace.main.app, host="127.0.0.1", port=port, log_level="error", lifespan="off"))
    thread = threading.Thread(target=lambda: server.run(sockets=[listener]), daemon=True)
    thread.start()
    try:
        for _ in range(100):
            if server.started:
                break
            time.sleep(0.05)
        assert server.started
        env = os.environ.copy()
        env["TEXTIFY_TEST_URL"] = f"http://127.0.0.1:{port}"
        root = Path(__file__).resolve().parents[1]
        result = subprocess.run(["node", str(root / "tools/verify-browser.mjs")], env=env, capture_output=True, text=True, timeout=120)
        assert result.returncode == 0, result.stdout + result.stderr
        print(result.stdout)
    finally:
        server.should_exit = True
        thread.join(timeout=10)
        listener.close()
