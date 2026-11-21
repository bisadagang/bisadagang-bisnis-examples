from client import sign_request

# Published test vector from the Bisadagang authentication docs.
signature = sign_request("rahasia-contoh", "GET", "/h2h/v1/products?category=Pulsa",
                         "1763337600", "0123456789abcdef0123456789abcdef")
if signature != "1c70ec830551bf90d017616759d563f395be4fbf5528f0beeb01ac5fad71cae6":
    raise SystemExit("Signature does not match the published test vector")
print(signature)
