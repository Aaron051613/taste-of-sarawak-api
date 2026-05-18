<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

function db(): PDO
{
	static $pdo = null;

	if ($pdo instanceof PDO) {
		return $pdo;
	}

	$host = '127.0.0.1';
	$database = 'taste_of_sarawak';
	$username = 'root';
	$password = '';

	$pdo = new PDO(
		"mysql:host={$host};dbname={$database};charset=utf8mb4",
		$username,
		$password,
		[
			PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
			PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
			PDO::ATTR_EMULATE_PREPARES => false,
		]
	);

	return $pdo;
}
