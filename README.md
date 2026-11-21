# Contoh integrasi API Bisadagang Bisnis

Contoh resmi untuk Mitra Bisnis yang menggunakan API H2H Bisadagang Bisnis untuk transaksi PPOB. Mulai dengan sandbox untuk mencoba alur transaksi dengan saldo simulasi. [Buka dokumentasi API](https://bisnis.bisadagang.com/docs).

## Siapkan sandbox

1. Buka dashboard Bisadagang Bisnis, pilih mode **Sandbox**, lalu buat API key.
2. Di folder bahasa yang Anda pilih, salin `.env.example` ke `.env`. Isi key sandbox yang berawalan `bdk_test_` dan API secret pasangannya.
3. Aktifkan produk yang ingin dicoba lewat menu **Produk** di mode Sandbox. Untuk reset saldo sandbox, buka menu **Deposit & saldo** di mode Sandbox.

| Variabel | Isi |
| --- | --- |
| `BISADAGANG_BASE_URL` | Default `https://api.bisadagang.com/h2h/v1`. Sandbox dan production memakai URL ini. API key menentukan environment. |
| `BISADAGANG_API_KEY` | API key sandbox dari dashboard, wajib untuk request API. |
| `BISADAGANG_API_SECRET` | API secret untuk menandatangani request, wajib untuk request API. |
| `BISADAGANG_WEBHOOK_SECRET` | Secret webhook sandbox dari menu **Webhook**, termasuk awalan `whsec_`. Wajib untuk penerima webhook. |

Jalankan blok persiapan dari root repositori di Bash. Setelah menyalin berkas, isi `.env` lalu jalankan blok perintah berikutnya dari folder yang sama. Contoh membaca environment variable proses. Di PowerShell, isi variabel yang sama dengan `$env:NAMA_VARIABEL = 'nilai'`. Simpan kredensial Anda di luar Git.

## Mulai cepat

Di setiap contoh, pilih kode produk prabayar nominal tetap yang aktif dari hasil daftar produk. Ganti `TSEL10` jika perlu. Nomor sandbox `081200000003` mencoba skenario pending yang berubah menjadi sukses sekitar 30 detik kemudian. Ganti `REF_ID` dengan nilai `ref_id` yang dicetak saat membuat transaksi.

### JavaScript · Node.js 18+

```bash
cd examples/js
cp .env.example .env
```

```bash
set -a; . ./.env; set +a
node sign-request.mjs
node check-balance.mjs
node list-products.mjs
node create-transaction.mjs TSEL10 081200000003
node check-transaction-status.mjs REF_ID
node webhook-receiver.mjs
```

### PHP · PHP 8.1+ dan ext-curl

```bash
cd examples/php
cp .env.example .env
```

```bash
set -a; . ./.env; set +a
php sign-request.php
php check-balance.php
php list-products.php
php create-transaction.php TSEL10 081200000003
php check-transaction-status.php REF_ID
php -S 127.0.0.1:8080 webhook-receiver.php
```

### Python · Python 3.10+

```bash
cd examples/python
cp .env.example .env
```

```bash
set -a; . ./.env; set +a
python3 sign-request.py
python3 check-balance.py
python3 list-products.py
python3 create-transaction.py TSEL10 081200000003
python3 check-transaction-status.py REF_ID
python3 webhook-receiver.py
```

`sign-request` memakai vektor signature publik dan bisa dijalankan sebelum mengisi kredensial. `list-products` menerima kategori opsional, misalnya `Pulsa`. Respons API membawa `request_id` untuk membantu penelusuran error.

## Ulangi transaksi dengan referensi yang sama

`create-transaction` membuat `ref_id` unik jika Anda menjalankannya tanpa argumen ketiga. Contoh mencetak referensi itu sebelum mengirim request. Simpan referensi beserta input transaksi. Jika koneksi terputus atau hasilnya belum pasti, cek status dengan referensi itu atau ulangi lewat contoh bahasa yang sama. Berikan kembali kode produk, nomor tujuan, dan `ref_id` yang sama sebagai argumen. Contoh akan memakai kembali `Idempotency-Key` dan byte body yang sama serta membuat timestamp, nonce, dan signature baru.

`Idempotency-Key` berlaku 24 jam. Tunggu beberapa detik sebelum mengulang jika API mengembalikan `REQUEST_IN_PROGRESS`. Untuk `REF_ID_CONFLICT`, cek transaksi yang sudah tercatat dengan referensi tersebut. Buat `ref_id` baru hanya untuk transaksi baru.

`check-transaction-status` menambah jeda antar-request dan mengikuti `Retry-After` saat tersedia pada respons yang dicoba ulang. Polling berhenti ketika status `success` atau `failed` muncul, atau saat batas percobaan tercapai. Jika transaksi masih `pending`, cek lagi dengan referensi yang sama atau tunggu webhook. [Lihat dokumentasi transaksi](https://bisnis.bisadagang.com/docs/api/transaksi).

## Terima webhook sandbox

Jalankan satu penerima, lalu arahkan URL HTTPS publik Anda ke `http://127.0.0.1:8080/webhook` melalui proxy HTTPS. Di dashboard mode Sandbox, buka menu **Webhook**, daftarkan URL HTTPS yang berakhir dengan `/webhook`, lalu gunakan **Kirim tes**.

Penerima memverifikasi timestamp dan signature dari byte body mentah sebelum membaca JSON. Selama rotasi secret, salah satu signature yang dipisahkan koma bisa cocok. Request dengan timestamp atau signature yang tidak valid mendapat HTTP 401. Event yang valid mendapat HTTP 200 setelah disimpan di `.webhook-inbox/`, atau langsung jika `event_id` sudah pernah disimpan atau event tersebut adalah `webhook.test`.

Folder inbox contoh memakai hard link untuk menyimpan satu berkas per `event_id`. Untuk integrasi Anda, simpan event dengan aturan unik atas `event_id` di database atau antrean, balas 2xx dalam 10 detik, lalu proses di worker. Pakai `created_at` dan status yang tersimpan saat menangani event yang tiba tidak berurutan. [Lihat dokumentasi webhook](https://bisnis.bisadagang.com/docs/api/webhook).

## Spesifikasi OpenAPI

Salinan spesifikasi tersedia dalam [JSON](openapi/openapi.json) dan [YAML](openapi/openapi.yaml). Untuk mengunduh ulang kedua berkas dari Bisadagang, jalankan `node scripts/sync-openapi` dari root repositori.
