import secrets
import sys

from client import print_response, request, run, validate_ref


def main():
    args = sys.argv[1:]
    if len(args) not in (2, 3) or not all(args[:2]):
        raise ValueError("Usage: python create-transaction.py PRODUCT_CODE CUSTOMER_NO [REF_ID]")
    product_code, customer_no = args[:2]
    ref_id = validate_ref(args[2] if len(args) == 3 else "demo-" + secrets.token_hex(16))
    # Save this before sending. Repeat with the same arguments after an ambiguous outcome.
    print(f"ref_id={ref_id}", file=sys.stderr)
    payload = {"product_code": product_code, "customer_no": customer_no, "ref_id": ref_id}
    print_response(request("POST", "/transactions", payload, "prepaid:" + ref_id))


run(main)
