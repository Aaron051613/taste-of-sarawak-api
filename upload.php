<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
api_bootstrap();

if (method() !== 'POST') {
    respond_json(['message' => 'Method not allowed'], 405);
}

if (empty($_FILES['image']) || !is_array($_FILES['image'])) {
    respond_json(['message' => 'No image uploaded'], 422);
}

$file = $_FILES['image'];
if ($file['error'] !== UPLOAD_ERR_OK) {
    respond_json(['message' => 'Upload failed with error ' . $file['error']], 400);
}

$uploadsDir = __DIR__ . '/uploads';
if (!is_dir($uploadsDir)) {
    if (!mkdir($uploadsDir, 0755, true)) {
        respond_json(['message' => 'Failed to create uploads directory'], 500);
    }
}

$origName = basename((string) $file['name']);
$ext = pathinfo($origName, PATHINFO_EXTENSION);
$base = pathinfo($origName, PATHINFO_FILENAME);
$safeBase = preg_replace('/[^A-Za-z0-9-_]/', '-', $base);
$timestamp = time();
$random = bin2hex(random_bytes(4));
$filename = strtolower($safeBase . '_' . $timestamp . '_' . $random . ($ext ? '.' . $ext : ''));

$dest = $uploadsDir . DIRECTORY_SEPARATOR . $filename;
if (!move_uploaded_file($file['tmp_name'], $dest)) {
    respond_json(['message' => 'Failed to move uploaded file'], 500);
}

$url = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'localhost') . dirname($_SERVER['SCRIPT_NAME']) . '/uploads/' . $filename;

respond_json(['message' => 'Uploaded', 'path' => '/uploads/' . $filename, 'url' => $url], 201);
