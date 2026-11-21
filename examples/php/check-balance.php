<?php
declare(strict_types=1);

require __DIR__ . '/client.php';

run(fn () => printResponse(request('GET', '/balance')));
