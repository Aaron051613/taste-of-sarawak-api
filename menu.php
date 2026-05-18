<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
api_bootstrap();

function fetch_menu_item(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM menu_items WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $id]);
    $item = $stmt->fetch();

    if (!$item) {
        return null;
    }

    return [
        'id' => (int) $item['id'],
        'name' => $item['name'],
        'category' => $item['category'],
        'description' => $item['description'],
        'image' => $item['image'],
        'sizes' => fetch_menu_sizes($pdo, $id),
        'addons' => fetch_menu_addons($pdo, $id),
        'drinkOptions' => fetch_menu_drink_options($pdo, $id),
    ];
}

function fetch_menu_sizes(PDO $pdo, int $menuItemId): array
{
    $stmt = $pdo->prepare('SELECT label, price FROM menu_sizes WHERE menu_item_id = :menu_item_id ORDER BY sort_order, id');
    $stmt->execute(['menu_item_id' => $menuItemId]);

    return array_map(static fn(array $row) => [
        'label' => $row['label'],
        'price' => (float) $row['price'],
    ], $stmt->fetchAll());
}

function fetch_menu_addons(PDO $pdo, int $menuItemId): array
{
    $stmt = $pdo->prepare('SELECT name, price FROM menu_addons WHERE menu_item_id = :menu_item_id ORDER BY sort_order, id');
    $stmt->execute(['menu_item_id' => $menuItemId]);

    return array_map(static fn(array $row) => [
        'name' => $row['name'],
        'price' => (float) $row['price'],
    ], $stmt->fetchAll());
}

function fetch_menu_drink_options(PDO $pdo, int $menuItemId): array
{
    $stmt = $pdo->prepare('SELECT label FROM menu_drink_options WHERE menu_item_id = :menu_item_id ORDER BY sort_order, id');
    $stmt->execute(['menu_item_id' => $menuItemId]);

    return array_map(static fn(array $row) => $row['label'], $stmt->fetchAll());
}

function fetch_menu_items(PDO $pdo): array
{
    $stmt = $pdo->query('SELECT id, name, category, description, image FROM menu_items WHERE active = 1 ORDER BY sort_order, id');
    $items = [];

    foreach ($stmt->fetchAll() as $row) {
        $items[] = [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'category' => $row['category'],
            'description' => $row['description'],
            'image' => $row['image'],
            'sizes' => fetch_menu_sizes($pdo, (int) $row['id']),
            'addons' => fetch_menu_addons($pdo, (int) $row['id']),
            'drinkOptions' => fetch_menu_drink_options($pdo, (int) $row['id']),
        ];
    }

    return $items;
}

function save_menu_children(PDO $pdo, int $menuItemId, array $payload): void
{
    $pdo->prepare('DELETE FROM menu_sizes WHERE menu_item_id = :menu_item_id')->execute(['menu_item_id' => $menuItemId]);
    $pdo->prepare('DELETE FROM menu_addons WHERE menu_item_id = :menu_item_id')->execute(['menu_item_id' => $menuItemId]);
    $pdo->prepare('DELETE FROM menu_drink_options WHERE menu_item_id = :menu_item_id')->execute(['menu_item_id' => $menuItemId]);

    $sizeStmt = $pdo->prepare('INSERT INTO menu_sizes (menu_item_id, label, price, sort_order) VALUES (:menu_item_id, :label, :price, :sort_order)');
    foreach (array_values($payload['sizes'] ?? []) as $index => $size) {
        $sizeStmt->execute([
            'menu_item_id' => $menuItemId,
            'label' => trim((string) ($size['label'] ?? '')),
            'price' => float_or_zero($size['price'] ?? 0),
            'sort_order' => $index + 1,
        ]);
    }

    if (($payload['category'] ?? '') !== 'Drinks') {
        $addonStmt = $pdo->prepare('INSERT INTO menu_addons (menu_item_id, name, price, sort_order) VALUES (:menu_item_id, :name, :price, :sort_order)');
        foreach (array_values($payload['addons'] ?? []) as $index => $addon) {
            $addonStmt->execute([
                'menu_item_id' => $menuItemId,
                'name' => trim((string) ($addon['name'] ?? '')),
                'price' => float_or_zero($addon['price'] ?? 0),
                'sort_order' => $index + 1,
            ]);
        }
    }

    $drinkStmt = $pdo->prepare('INSERT INTO menu_drink_options (menu_item_id, label, sort_order) VALUES (:menu_item_id, :label, :sort_order)');
    foreach (array_values($payload['drinkOptions'] ?? []) as $index => $option) {
        $label = trim((string) $option);
        if ($label === '') {
            continue;
        }

        $drinkStmt->execute([
            'menu_item_id' => $menuItemId,
            'label' => $label,
            'sort_order' => $index + 1,
        ]);
    }
}

$pdo = db();
$method = method();
$id = isset($_GET['id']) ? (int) $_GET['id'] : null;

if ($method === 'GET') {
    if ($id) {
        $item = fetch_menu_item($pdo, $id);
        if (!$item) {
            respond_json(['message' => 'Menu item not found'], 404);
        }
        respond_json(['item' => $item]);
    }

    respond_json(['items' => fetch_menu_items($pdo)]);
}

$payload = json_input();
$name = trim((string) ($payload['name'] ?? ''));
$category = trim((string) ($payload['category'] ?? ''));
$description = trim((string) ($payload['description'] ?? ''));
$image = trim((string) ($payload['image'] ?? ''));
$sizes = is_array($payload['sizes'] ?? null) ? $payload['sizes'] : [];

if ($name === '' || $category === '' || $description === '' || $image === '' || count($sizes) === 0) {
    respond_json(['message' => 'Missing menu item fields'], 422);
}

$pdo->beginTransaction();

try {
    if ($method === 'DELETE') {
        $targetId = $id ?: (int) ($payload['id'] ?? 0);
        if ($targetId <= 0) {
            throw new RuntimeException('Menu item id is required');
        }

        $stmt = $pdo->prepare('DELETE FROM menu_items WHERE id = :id');
        $stmt->execute(['id' => $targetId]);
        $pdo->commit();
        respond_json(['message' => 'Menu item deleted']);
    }

    if ($method === 'POST' && !empty($payload['id'])) {
        $targetId = (int) $payload['id'];
        $stmt = $pdo->prepare('UPDATE menu_items SET name = :name, category = :category, description = :description, image = :image WHERE id = :id');
        $stmt->execute([
            'name' => $name,
            'category' => $category,
            'description' => $description,
            'image' => $image,
            'id' => $targetId,
        ]);
        save_menu_children($pdo, $targetId, $payload);
        $pdo->commit();
        respond_json(['item' => fetch_menu_item($pdo, $targetId)]);
    }

    if ($method === 'PATCH' || $method === 'POST') {
        if ($method === 'PATCH' && !empty($payload['id'])) {
            $targetId = (int) $payload['id'];
            $stmt = $pdo->prepare('UPDATE menu_items SET name = :name, category = :category, description = :description, image = :image WHERE id = :id');
            $stmt->execute([
                'name' => $name,
                'category' => $category,
                'description' => $description,
                'image' => $image,
                'id' => $targetId,
            ]);
            save_menu_children($pdo, $targetId, $payload);
            $pdo->commit();
            respond_json(['item' => fetch_menu_item($pdo, $targetId)]);
        }

        $stmt = $pdo->prepare('INSERT INTO menu_items (name, category, description, image, sort_order) VALUES (:name, :category, :description, :image, :sort_order)');
        $stmt->execute([
            'name' => $name,
            'category' => $category,
            'description' => $description,
            'image' => $image,
            'sort_order' => (int) ($payload['sort_order'] ?? 0),
        ]);
        $targetId = (int) $pdo->lastInsertId();
        save_menu_children($pdo, $targetId, $payload);
        $pdo->commit();
        respond_json(['item' => fetch_menu_item($pdo, $targetId)], 201);
    }

    throw new RuntimeException('Unsupported method');
} catch (Throwable $error) {
    $pdo->rollBack();
    respond_json(['message' => $error->getMessage()], 400);
}
