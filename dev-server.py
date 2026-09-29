#!/usr/bin/env python3
"""Local dev server: serves the static site, mimics the Netlify /arc-api/* proxy, and
serves config.js from ARC_APP_KEY (read from the environment or a .env file).

Usage: python3 dev-server.py [port]   (default 8080)
"""
import http.server
import json
import os
import sys
import urllib.error
import urllib.request

UPSTREAM = "https://arctracker.io/api/"
FORWARD_HEADERS = ("Authorization", "X-App-Key", "Accept")


def load_dotenv(path=".env"):
    """Minimal .env reader: KEY=VALUE lines; existing environment variables win."""
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("'\""))


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?")[0] == "/config.js":
            return self.send_config()
        if not self.path.startswith("/arc-api/"):
            return super().do_GET()
        url = UPSTREAM + self.path[len("/arc-api/"):]
        req = urllib.request.Request(url, headers={"User-Agent": "arc-quest-tracker-dev"})
        for h in FORWARD_HEADERS:
            if self.headers.get(h):
                req.add_header(h, self.headers[h])
        try:
            with urllib.request.urlopen(req) as resp:
                status, body, ctype = resp.status, resp.read(), resp.headers.get("Content-Type")
        except urllib.error.HTTPError as e:
            status, body, ctype = e.code, e.read(), e.headers.get("Content-Type")
        self.send_response(status)
        self.send_header("Content-Type", ctype or "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_config(self):
        config = {"appKey": os.environ.get("ARC_APP_KEY", "")}
        body = f"window.ARC_CONFIG = {json.dumps(config)};\n".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/javascript")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    load_dotenv()
    if not os.environ.get("ARC_APP_KEY"):
        print("warning: ARC_APP_KEY is not set (copy .env.example to .env)")
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f"Serving on http://localhost:{port}")
    http.server.ThreadingHTTPServer(("", port), Handler).serve_forever()
