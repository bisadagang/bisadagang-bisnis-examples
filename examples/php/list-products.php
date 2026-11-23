<?php
declare(strict_types=1);

require __DIR__ . '/client.php';

run(function () use ($argv): void {
    $category = $argv[1] ?? '';
    $query = $category === '' ? '' : '?' . http_build_query(['category' => $category]);
    printResponse(request('GET', '/products' . $query));
});
