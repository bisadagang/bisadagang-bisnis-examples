import sys
import time
from urllib.parse import quote

from client import ApiError, print_response, request, run, validate_ref


def main():
    ref_id = validate_ref(sys.argv[1] if len(sys.argv) > 1 else "")
    delay = 2
    for attempt in range(1, 9):
        wait = delay
        try:
            result = request("GET", "/transactions/" + quote(ref_id, safe=""))
            print_response(result)
            status = result["data"]["status"]
            if status in ("success", "failed"):
                return
            if status != "pending":
                raise ValueError("Unexpected transaction status")
        except ApiError as error:
            if error.status != 429 and error.status < 500:
                raise
            print(error, file=sys.stderr)
            wait = max(delay, error.retry_after)
        if attempt < 8:
            time.sleep(wait)
        delay = min(delay * 2, 15)
    raise ValueError("Polling ended without a final status. Check again with the same ref_id.")


run(main)
