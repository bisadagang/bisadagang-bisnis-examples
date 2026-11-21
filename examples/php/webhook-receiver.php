<?php
declare(strict_types=1);

require __DIR__ . '/client.php';

function verifyWebhook(string $secret, string $timestamp, string $body, string $header): bool
{
    if (!preg_match('/\A[0-9]{1,12}\z/', $timestamp) || abs(microtime(true) - (float) $timestamp) > 300) {
        return false;
    }
    $expected = hash_hmac('sha256', $timestamp . '.' . $body, $secret);
    foreach (explode(',', $header) as $value) {
        if (hash_equals($expected, trim($value))) {
            return true;
        }
    }
    return false;
}

function enqueueWebhook(string $id, string $body): void
{
    // Publish the entire payload at once. Retried deliveries keep the same event_id.
    $inbox = '.webhook-inbox';
    if (!is_dir($inbox) && !@mkdir($inbox, 0700) && !is_dir($inbox)) {
        throw new RuntimeException('Cannot create webhook inbox');
    }
    $temp = tempnam($inbox, 'event-');
    if ($temp === false) {
        throw new RuntimeException('Cannot create temporary webhook file');
    }
    try {
        $file = fopen($temp, 'wb');
        if ($file === false) {
            throw new RuntimeException('Cannot open temporary webhook file');
        }
        try {
            if (fwrite($file, $body) !== strlen($body) || !fflush($file) || !fsync($file)) {
                throw new RuntimeException('Cannot save webhook payload');
            }
        } finally {
            fclose($file);
        }
        $eventFile = $inbox . '/' . $id . '.json';
        if (!@link($temp, $eventFile) && !is_file($eventFile)) {
            throw new RuntimeException('Cannot publish webhook payload');
        }
    } finally {
        @unlink($temp);
    }
}

if (($_SERVER['REQUEST_URI'] ?? '') !== '/webhook') {
    http_response_code(404);
    return;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    http_response_code(405);
    return;
}

try {
    $secret = requiredEnv('BISADAGANG_WEBHOOK_SECRET');
    $maxBody = 1024 * 1024;
    $body = file_get_contents('php://input', false, null, 0, $maxBody + 1);
    if ($body === false) {
        http_response_code(400);
        return;
    }
    if (strlen($body) > $maxBody) {
        http_response_code(413);
        return;
    }
    if (!verifyWebhook($secret, $_SERVER['HTTP_X_BISADAGANG_TIMESTAMP'] ?? '',
        $body, $_SERVER['HTTP_X_BISADAGANG_SIGNATURE'] ?? '')) {
        http_response_code(401);
        return;
    }
    $event = json_decode($body, true);
    $id = $event['event_id'] ?? null;
    if (!is_string($id) || !preg_match('/\Awhd_[A-Za-z0-9]{24}\z/', $id)) {
        http_response_code(400);
        return;
    }
    if (($event['event'] ?? '') !== 'webhook.test') {
        enqueueWebhook($id, $body);
    }
    http_response_code(200);
} catch (Throwable $error) {
    error_log($error->getMessage());
    http_response_code(500);
}
