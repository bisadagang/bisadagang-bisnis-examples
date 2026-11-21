import sys
from urllib.parse import urlencode

from client import print_response, request, run


def main():
    category = sys.argv[1] if len(sys.argv) > 1 else ""
    query = "?" + urlencode({"category": category}) if category else ""
    print_response(request("GET", "/products" + query))


run(main)
