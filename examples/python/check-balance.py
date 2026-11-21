from client import print_response, request, run

run(lambda: print_response(request("GET", "/balance")))
