<?php
declare(strict_types=1);

require_once __DIR__ . '/order_helpers.php';
api_bootstrap();

function fetch_table_overview(PDO $pdo): array
{
    $tableRows = [];
    for ($tableNumber = 1; $tableNumber <= 10; $tableNumber++) {
        $sessionStmt = $pdo->prepare('SELECT table_number, status FROM table_sessions WHERE table_number = :table_number LIMIT 1');
        $sessionStmt->execute(['table_number' => $tableNumber]);
        $session = $sessionStmt->fetch() ?: [
            'table_number' => $tableNumber,
            'status' => 'available',
        ];

        $tableRows[] = [
            'tableNumber' => $tableNumber,
            'status' => (string) ($session['status'] ?? 'available'),
        ];
    }

    return $tableRows;
}

$pdo = db();
$method = method();

if ($method === 'GET') {
    respond_json(['tables' => fetch_table_overview($pdo)]);
}

$payload = json_input();
$tableNumber = int_or_null($payload['tableNumber'] ?? $payload['table_number'] ?? null);
$action = strtolower((string) ($payload['action'] ?? ''));
$orderType = text_or_null($payload['orderType'] ?? $payload['order_type'] ?? null) ?: 'dine-in';

if (!$tableNumber || $tableNumber < 1 || $tableNumber > 10) {
    respond_json(['message' => 'Valid table number is required'], 422);
}

if ($action === 'occupy') {
    ensure_table_occupied($pdo, $tableNumber, $orderType, $payload['orderCode'] ?? $payload['order_code'] ?? null);
    respond_json(['message' => 'Table marked occupied', 'tables' => fetch_table_overview($pdo)]);
}

if ($action === 'release') {
    sync_table_session_if_idle($pdo, $tableNumber);
    respond_json(['message' => 'Table released if idle', 'tables' => fetch_table_overview($pdo)]);
}

respond_json(['message' => 'Unsupported table action'], 422);
