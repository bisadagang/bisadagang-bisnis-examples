import hashlib
import hmac
import json
import os
import re
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from client import required_env

INBOX = Path(".webhook-inbox")
MAX_BODY = 1024 * 1024


def verify(secret, timestamp, body, header):
    if not re.fullmatch(r"[0-9]{1,12}", timestamp) or abs(time.time() - int(timestamp)) > 300:
        return False
    expected = hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    candidates = (item.strip() for item in header.split(","))
    return any(re.fullmatch(r"[0-9a-f]{64}", item) and hmac.compare_digest(expected, item)
               for item in candidates)


def enqueue(event_id, body):
    # Publish the entire payload at once. Retried deliveries keep the same event_id.
    file = tempfile.NamedTemporaryFile(dir=INBOX, suffix=".tmp", delete=False)
    path = Path(file.name)
    try:
        with file:
            file.write(body)
            file.flush()
            os.fsync(file.fileno())
        try:
            os.link(path, INBOX / (event_id + ".json"))
        except FileExistsError:
            pass
    finally:
        path.unlink(missing_ok=True)


class WebhookHandler(BaseHTTPRequestHandler):
    timeout = 10

    def reply(self, status):
        self.send_response(status)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        if self.path != "/webhook":
            return self.reply(404)
        length_header = self.headers.get("Content-Length", "")
        if not re.fullmatch(r"[0-9]{1,12}", length_header):
            return self.reply(400)
        length = int(length_header)
        if length > MAX_BODY:
            return self.reply(413)
        body = self.rfile.read(length)
        if len(body) != length:
            return self.reply(400)
        timestamp = self.headers.get("X-Bisadagang-Timestamp", "")
        header = self.headers.get("X-Bisadagang-Signature", "")
        if not verify(self.server.secret, timestamp, body, header):
            return self.reply(401)
        try:
            event = json.loads(body.decode("utf-8"))
        except (ValueError, UnicodeError):
            return self.reply(400)
        event_id = event.get("event_id") if isinstance(event, dict) else None
        if not isinstance(event_id, str) or not re.fullmatch(r"whd_[A-Za-z0-9]{24}", event_id):
            return self.reply(400)
        if event.get("event") != "webhook.test":
            try:
                enqueue(event_id, body)
            except OSError as error:
                self.log_error("%s", error)
                return self.reply(500)
        return self.reply(200)


if __name__ == "__main__":
    secret = required_env("BISADAGANG_WEBHOOK_SECRET")
    INBOX.mkdir(mode=0o700, exist_ok=True)
    with ThreadingHTTPServer(("127.0.0.1", 8080), WebhookHandler) as server:
        server.secret = secret
        print("Listening on http://127.0.0.1:8080/webhook", flush=True)
        server.serve_forever()
