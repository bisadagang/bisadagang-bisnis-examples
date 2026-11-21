import hashlib
import hmac
import json
import os
import re
import secrets
import sys
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


def required_env(name):
    value = os.environ.get(name)
    if not value:
        raise ValueError(f"Set {name}")
    return value


def sign_request(secret, method, target, timestamp, nonce, body=b""):
    body_hash = hashlib.sha256(body).hexdigest()
    canonical = "\n".join((method.upper(), target, timestamp, nonce, body_hash))
    return hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class ApiError(Exception):
    def __init__(self, status, headers, envelope):
        self.status = status
        error = envelope.get("error") or {}
        self.code = error.get("code")
        request_id = envelope.get("request_id")
        retry_after = headers.get("Retry-After", "")
        self.retry_after = int(retry_after) if retry_after.isdecimal() else 0
        parts = (f"HTTP {status}", self.code, error.get("message"),
                 f"request_id={request_id}" if request_id else None)
        super().__init__(" | ".join(filter(None, parts)))


def request(method, endpoint, payload=None, idempotency_key=None):
    # Sandbox and production share a URL. The API key selects the environment.
    base = urlsplit(os.environ.get("BISADAGANG_BASE_URL") or "https://api.bisadagang.com/h2h/v1")
    if (base.scheme != "https" or not base.hostname or base.username is not None
            or base.query or base.fragment):
        raise ValueError("BISADAGANG_BASE_URL must be an HTTPS URL without credentials, query or fragment")
    target = base.path.rstrip("/") + endpoint
    body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    timestamp = str(int(time.time()))
    nonce = secrets.token_hex(16)
    headers = {
        "Accept": "application/json",
        "X-Bisadagang-Key": required_env("BISADAGANG_API_KEY"),
        "X-Bisadagang-Timestamp": timestamp,
        "X-Bisadagang-Nonce": nonce,
        "X-Bisadagang-Signature": sign_request(
            required_env("BISADAGANG_API_SECRET"), method, target, timestamp, nonce, body or b""
        ),
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key

    req = Request(f"https://{base.netloc}{target}", data=body, headers=headers, method=method)
    try:
        response = build_opener(NoRedirects()).open(req, timeout=10)
    except HTTPError as error:
        response = error
    with response:
        try:
            envelope = json.loads(response.read())
        except (ValueError, UnicodeError):
            envelope = {}
        if not isinstance(envelope, dict):
            envelope = {}
        if not 200 <= response.status < 300 or envelope.get("success") is not True:
            raise ApiError(response.status, response.headers, envelope)
    return envelope


def validate_ref(ref):
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,50}", ref) or ref in (".", ".."):
        raise ValueError("Use a ref_id of 1–50 letters, digits, dots, underscores or hyphens")
    return ref


def print_response(envelope):
    print(json.dumps(envelope, ensure_ascii=False, indent=2))


def run(main):
    try:
        main()
    except (ApiError, OSError, ValueError) as error:
        sys.exit(str(error))
