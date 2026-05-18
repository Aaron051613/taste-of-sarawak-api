<?php
declare(strict_types=1);

require_once __DIR__ . '/order_helpers.php';
api_bootstrap();

$pdo = db();
$method = method();

if ($method === 'GET') {
    respond_json(['orders' => fetch_order_list($pdo)]);
}

$payload = json_input();
$orderIdentifier = $payload['id'] ?? $payload['orderCode'] ?? $payload['order_code'] ?? ($_GET['id'] ?? null);

if ($method === 'DELETE') {
    $resetAll = (bool) ($payload['resetAll'] ?? $payload['reset_all'] ?? false);
    if ($resetAll) {
        $pdo->beginTransaction();
        try {
            $pdo->exec('DELETE FROM orders');
                $pdo->exec("UPDATE table_sessions SET status = 'available'");
            $pdo->commit();
            respond_json(['message' => 'All orders reset']);
        } catch (Throwable $error) {
            $pdo->rollBack();
            respond_json(['message' => 'Failed to reset orders'], 500);
        }
    }

    if ($orderIdentifier === null || $orderIdentifier === '') {
        respond_json(['message' => 'Order id is required'], 422);
    }

    $order = resolve_order_identifier($pdo, $orderIdentifier);
    if (!$order) {
        respond_json(['message' => 'Order not found'], 404);
    }

    $stmt = $pdo->prepare('DELETE FROM orders WHERE id = :id');
    $stmt->execute(['id' => $order['id']]);

    if ($order['tableNumber'] !== null) {
        sync_table_session_if_idle($pdo, (int) $order['tableNumber']);
    }

    respond_json(['message' => 'Order deleted']);
}

if ($orderIdentifier === null || $orderIdentifier === '') {
    respond_json(['message' => 'Order id is required'], 422);
}

if ($method === 'PATCH' || $method === 'POST') {
    $order = resolve_order_identifier($pdo, $orderIdentifier);
    if (!$order) {
        respond_json(['message' => 'Order not found'], 404);
    }

    $fields = [];
    $params = ['id' => $order['id']];

    if (array_key_exists('status', $payload)) {
        $fields[] = 'status = :status';
        $params['status'] = (string) $payload['status'];
    }

    if (array_key_exists('payment', $payload)) {
        $fields[] = 'payment = :payment';
        $params['payment'] = (string) $payload['payment'];
    }

    if (array_key_exists('tableNumber', $payload) || array_key_exists('table_number', $payload)) {
        $fields[] = 'table_number = :table_number';
        $params['table_number'] = int_or_null($payload['tableNumber'] ?? $payload['table_number']);
    }

    if (array_key_exists('orderType', $payload) || array_key_exists('order_type', $payload)) {
        $fields[] = 'order_type = :order_type';
        $params['order_type'] = (string) ($payload['orderType'] ?? $payload['order_type']);
    }

    if (count($fields) === 0) {
        respond_json(['message' => 'No order fields supplied'], 422);
    }

    $sql = 'UPDATE orders SET ' . implode(', ', $fields) . ' WHERE id = :id';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    if ($order['tableNumber'] !== null) {
        sync_table_session_if_idle($pdo, (int) $order['tableNumber']);
    }

    respond_json(['message' => 'Order updated', 'order' => fetch_order($pdo, $order['id'])]);
}

respond_json(['message' => 'Method not allowed'], 405);
