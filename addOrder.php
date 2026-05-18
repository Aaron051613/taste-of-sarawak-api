<?php
declare(strict_types=1);

require_once __DIR__ . '/order_helpers.php';
api_bootstrap();

if (method() !== 'POST') {
    respond_json(['message' => 'Method not allowed'], 405);
}

$payload = json_input();
$items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
$total = float_or_zero($payload['total'] ?? 0);
$tableNumber = int_or_null($payload['tableNumber'] ?? null);
$orderType = text_or_null($payload['orderType'] ?? null) ?: ($tableNumber ? 'dine-in' : 'take-away');
$orderCode = text_or_null($payload['orderCode'] ?? $payload['order_code'] ?? null) ?: generate_order_code();

if (count($items) === 0) {
    respond_json(['message' => 'Order items are required'], 422);
}

$pdo = db();
$pdo->beginTransaction();

try {
    $stmt = $pdo->prepare(
        'INSERT INTO orders (order_code, table_number, order_type, status, payment, total)
         VALUES (:order_code, :table_number, :order_type, :status, :payment, :total)'
    );
    $stmt->execute([
        'order_code' => $orderCode,
        'table_number' => $tableNumber,
        'order_type' => $orderType,
        'status' => 'Pending',
        'payment' => 'Unpaid',
        'total' => $total,
    ]);

    $orderId = (int) $pdo->lastInsertId();
    $itemStmt = $pdo->prepare(
        'INSERT INTO order_items (order_id, menu_item_id, item_name, size_label, unit_price, quantity, line_total)
         VALUES (:order_id, :menu_item_id, :item_name, :size_label, :unit_price, :quantity, :line_total)'
    );
    $addonStmt = $pdo->prepare(
        'INSERT INTO order_item_addons (order_item_id, addon_name, addon_price)
         VALUES (:order_item_id, :addon_name, :addon_price)'
    );

    foreach ($items as $item) {
        $quantity = max(1, (int) ($item['quantity'] ?? 1));
        $unitPrice = float_or_zero($item['unitPrice'] ?? 0);
        $sizeLabel = text_or_null($item['size']['label'] ?? $item['size_label'] ?? $item['size'] ?? '') ?? '';
        $name = text_or_null($item['name'] ?? $item['item']['name'] ?? '') ?? 'Item';
        $menuItemId = int_or_null($item['menu_item_id'] ?? $item['item']['id'] ?? null);
        $lineTotal = round($unitPrice * $quantity, 2);

        $itemStmt->execute([
            'order_id' => $orderId,
            'menu_item_id' => $menuItemId,
            'item_name' => $name,
            'size_label' => $sizeLabel,
            'unit_price' => $unitPrice,
            'quantity' => $quantity,
            'line_total' => $lineTotal,
        ]);

        $orderItemId = (int) $pdo->lastInsertId();
        foreach (array_values($item['addons'] ?? []) as $addon) {
            $addonStmt->execute([
                'order_item_id' => $orderItemId,
                'addon_name' => trim((string) ($addon['name'] ?? $addon['addon_name'] ?? '')),
                'addon_price' => float_or_zero($addon['price'] ?? $addon['addon_price'] ?? 0),
            ]);
        }
    }

    ensure_table_occupied($pdo, $tableNumber, $orderType, $orderCode);
    $pdo->commit();

    respond_json([
        'message' => 'Order saved',
        'order' => fetch_order($pdo, $orderId),
    ], 201);
} catch (Throwable $error) {
    $pdo->rollBack();
    respond_json(['message' => $error->getMessage()], 400);
}
