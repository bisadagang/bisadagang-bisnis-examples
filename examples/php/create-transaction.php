<?php
declare(strict_types=1);

require __DIR__ . '/client.php';

run(function () use ($argv): void {
    if (count($argv) < 3 || count($argv) > 4 || $argv[1] === '' || $argv[2] === '') {
        throw new RuntimeException('Usage: php create-transaction.php PRODUCT_CODE CUSTOMER_NO [REF_ID]');
    }
    [$productCode, $customerNo] = array_slice($argv, 1, 2);
    $refId = validateRef($argv[3] ?? 'demo-' . bin2hex(random_bytes(16)));
    // Save this before sending. Repeat with the same arguments after an ambiguous outcome.
    fwrite(STDERR, 'ref_id=' . $refId . PHP_EOL);
    $payload = ['product_code' => $productCode, 'customer_no' => $customerNo, 'ref_id' => $refId];
    printResponse(request('POST', '/transactions', $payload, 'prepaid:' . $refId));
});
