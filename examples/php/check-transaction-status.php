<?php
declare(strict_types=1);

require __DIR__ . '/client.php';

run(function () use ($argv): void {
    $refId = validateRef($argv[1] ?? '');
    $delay = 2;
    for ($attempt = 1; $attempt <= 8; $attempt++) {
        $wait = $delay;
        try {
            $result = request('GET', '/transactions/' . rawurlencode($refId));
            printResponse($result);
            // message is display-only; use status for integration decisions.
            $status = $result['data']['status'];
            if (in_array($status, ['success', 'failed'], true)) {
                return;
            }
            if ($status !== 'pending') {
                throw new RuntimeException('Unexpected transaction status');
            }
        } catch (ApiError $error) {
            if ($error->status !== 429 && $error->status < 500) {
                throw $error;
            }
            fwrite(STDERR, $error->getMessage() . PHP_EOL);
            $wait = max($delay, $error->retryAfter);
        }
        if ($attempt < 8) {
            sleep($wait);
        }
        $delay = min($delay * 2, 15);
    }
    throw new RuntimeException('Polling ended without a final status. Check again with the same ref_id.');
});
