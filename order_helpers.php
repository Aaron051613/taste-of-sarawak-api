<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

function generate_order_code(): string
{
    return 'SB-' . str_replace('.', '', (string) microtime(true));
}

function fetch_order_items(PDO $pdo, int $orderId): array
{
    $stmt = $pdo->prepare('SELECT id, menu_item_id, item_name, size_label, unit_price, quantity, line_total FROM order_items WHERE order_id = :order_id ORDER BY id ASC');
    $stmt->execute(['order_id' => $orderId]);
    $items = [];

    foreach ($stmt->fetchAll() as $row) {
        $addonStmt = $pdo->prepare('SELECT addon_name, addon_price FROM order_item_addons WHERE order_item_id = :order_item_id ORDER BY id ASC');
        $addonStmt->execute(['order_item_id' => (int) $row['id']]);

        $items[] = [
            'id' => (int) $row['id'],
            'menu_item_id' => $row['menu_item_id'] !== null ? (int) $row['menu_item_id'] : null,
            'name' => $row['item_name'],
            'size' => $row['size_label'],
            'unitPrice' => (float) $row['unit_price'],
            'quantity' => (int) $row['quantity'],
            'lineTotal' => (float) $row['line_total'],
            'addons' => array_map(static fn(array $addon) => [
                'name' => $addon['addon_name'],
                'price' => (float) $addon['addon_price'],
            ], $addonStmt->fetchAll()),
        ];
    }

    return $items;
}

function fetch_order(PDO $pdo, int $orderId): ?array
{
    $stmt = $pdo->prepare('SELECT id, order_code, table_number, order_type, status, payment, total, created_at, updated_at FROM orders WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $orderId]);
    $order = $stmt->fetch();

    if (!$order) {
        return null;
    }

    return [
        'id' => (int) $order['id'],
        'orderCode' => $order['order_code'],
        'tableNumber' => $order['table_number'] !== null ? (int) $order['table_number'] : null,
        'orderType' => $order['order_type'],
        'status' => $order['status'],
        'payment' => $order['payment'],
        'total' => (float) $order['total'],
        'placedAt' => $order['created_at'],
        'updatedAt' => $order['updated_at'],
        'items' => fetch_order_items($pdo, (int) $order['id']),
    ];
}

function resolve_order_identifier(PDO $pdo, mixed $identifier): ?array
{
    $orderId = is_numeric($identifier) ? (int) $identifier : 0;
    $orderCode = text_or_null($identifier);

    if ($orderId > 0) {
        $order = fetch_order($pdo, $orderId);
        if ($order) {
            return $order;
        }
    }

    if ($orderCode === null) {
        return null;
    }

    $stmt = $pdo->prepare('SELECT id FROM orders WHERE order_code = :order_code LIMIT 1');
    $stmt->execute(['order_code' => $orderCode]);
    $resolvedId = $stmt->fetchColumn();

    if ($resolvedId === false || $resolvedId === null) {
        return null;
    }

    return fetch_order($pdo, (int) $resolvedId);
}

function fetch_order_list(PDO $pdo): array
{
    $stmt = $pdo->query('SELECT id FROM orders ORDER BY created_at DESC, id DESC');
    $orders = [];

    foreach ($stmt->fetchAll() as $row) {
        $order = fetch_order($pdo, (int) $row['id']);
        if ($order) {
            $orders[] = $order;
        }
    }

    return $orders;
}

function ensure_table_occupied(PDO $pdo, ?int $tableNumber, string $orderType, ?string $orderCode = null): void
{
    if ($orderType !== 'dine-in' || !$tableNumber) {
        return;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO table_sessions (table_number, status)
         VALUES (:table_number, :status)
         ON DUPLICATE KEY UPDATE status = VALUES(status)'
    );
    $stmt->execute([
        'table_number' => $tableNumber,
        'status' => 'occupied',
    ]);
}

function sync_table_session_if_idle(PDO $pdo, ?int $tableNumber): void
{
    if (!$tableNumber) {
        return;
    }

    $stmt = $pdo->prepare(
        'SELECT COUNT(*) AS active_count
         FROM orders
         WHERE table_number = :table_number AND payment <> :paid'
    );
    $stmt->execute([
        'table_number' => $tableNumber,
        'paid' => 'Paid',
    ]);
    $activeCount = (int) ($stmt->fetch()['active_count'] ?? 0);

    if ($activeCount > 0) {
        $pdo->prepare('UPDATE table_sessions SET status = :status WHERE table_number = :table_number')
            ->execute([
                'status' => 'occupied',
                'table_number' => $tableNumber,
            ]);
        return;
    }

    $pdo->prepare('UPDATE table_sessions SET status = :status WHERE table_number = :table_number')
        ->execute([
            'status' => 'available',
            'table_number' => $tableNumber,
        ]);
}
