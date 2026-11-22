import sys
from urllib.parse import urlencode

from client import print_response, request, run


def main():
    category = sys.argv[1] if len(sys.argv) > 1 else ""
    query = "?" + urlencode({"category": category}) if category else ""
    # sample_size, sample_size_30d, and sample_size_90d are bands or None.
    print_response(request("GET", "/products" + query))


run(main)
