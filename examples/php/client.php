<?php
declare(strict_types=1);

function requiredEnv(string $name): string
{
    $value = getenv($name);
    if ($value === false || $value === '') {
        throw new RuntimeException('Set ' . $name);
    }
    return $value;
}

function signRequest(
    string $secret, string $method, string $target, string $timestamp, string $nonce, string $body = ''
): string {
    $canonical = implode("\n", [strtoupper($method), $target, $timestamp, $nonce, hash('sha256', $body)]);
    return hash_hmac('sha256', $canonical, $secret);
}

final class ApiError extends RuntimeException
{
    public function __construct(public int $status, public int $retryAfter, array $envelope)
    {
        $parts = ['HTTP ' . $status, $envelope['error']['code'] ?? null, $envelope['error']['message'] ?? null];
        if (!empty($envelope['request_id'])) {
            $parts[] = 'request_id=' . $envelope['request_id'];
        }
        parent::__construct(implode(' | ', array_filter($parts)));
    }
}

function request(string $method, string $endpoint, ?array $payload = null, ?string $idempotencyKey = null): array
{
    // Sandbox and production share a URL. The API key selects the environment.
    $url = rtrim(getenv('BISADAGANG_BASE_URL') ?: 'https://api.bisadagang.com/h2h/v1', '/');
    $base = parse_url($url);
    if (($base['scheme'] ?? '') !== 'https' || empty($base['host'])
        || isset($base['user']) || isset($base['query']) || isset($base['fragment'])) {
        throw new RuntimeException('BISADAGANG_BASE_URL must be an HTTPS URL without credentials, query or fragment');
    }
    $target = ($base['path'] ?? '') . $endpoint;
    $body = $payload === null ? null : json_encode($payload, JSON_THROW_ON_ERROR);
    $timestamp = (string) time();
    $nonce = bin2hex(random_bytes(16));
    $signature = signRequest(requiredEnv('BISADAGANG_API_SECRET'), $method, $target, $timestamp, $nonce, $body ?? '');
    $headers = [
        'Accept: application/json',
        'X-Bisadagang-Key: ' . requiredEnv('BISADAGANG_API_KEY'),
        'X-Bisadagang-Timestamp: ' . $timestamp,
        'X-Bisadagang-Nonce: ' . $nonce,
        'X-Bisadagang-Signature: ' . $signature,
    ];
    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
    }
    if ($idempotencyKey !== null) {
        $headers[] = 'Idempotency-Key: ' . $idempotencyKey;
    }

    $retryAfter = 0;
    $curl = curl_init($url . $endpoint);
    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PATH_AS_IS => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HEADERFUNCTION => static function ($curl, string $header) use (&$retryAfter): int {
            if (preg_match('/^Retry-After:\s*([0-9]+)\s*$/i', $header, $matches)) {
                $retryAfter = (int) $matches[1];
            }
            return strlen($header);
        },
    ]);
    if ($body !== null) {
        curl_setopt($curl, CURLOPT_POSTFIELDS, $body);
    }
    try {
        $raw = curl_exec($curl);
        if ($raw === false) {
            throw new RuntimeException(curl_error($curl));
        }
        $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    } finally {
        curl_close($curl);
    }
    $envelope = json_decode($raw, true);
    if ($status < 200 || $status >= 300 || ($envelope['success'] ?? false) !== true) {
        throw new ApiError($status, $retryAfter, is_array($envelope) ? $envelope : []);
    }
    return $envelope;
}

function validateRef(string $ref): string
{
    if (!preg_match('/\A[A-Za-z0-9._-]{1,50}\z/', $ref) || in_array($ref, ['.', '..'], true)) {
        throw new RuntimeException('Use a ref_id of 1–50 letters, digits, dots, underscores or hyphens');
    }
    return $ref;
}

function printResponse(array $envelope): void
{
    echo json_encode($envelope, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), PHP_EOL;
}

function run(callable $main): void
{
    try {
        $main();
    } catch (Throwable $error) {
        fwrite(STDERR, $error->getMessage() . PHP_EOL);
        exit(1);
    }
}
