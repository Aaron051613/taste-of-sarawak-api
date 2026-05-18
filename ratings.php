<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
api_bootstrap();

function fetch_rating_list(PDO $pdo, ?int $menuItemId = null): array
{
    if ($menuItemId) {
        $stmt = $pdo->prepare('SELECT id, menu_item_id, rating, comment, created_at FROM ratings WHERE menu_item_id = :menu_item_id ORDER BY created_at DESC, id DESC');
        $stmt->execute(['menu_item_id' => $menuItemId]);
        return $stmt->fetchAll();
    }

    $stmt = $pdo->query('SELECT id, menu_item_id, rating, comment, created_at FROM ratings ORDER BY created_at DESC, id DESC');
    return $stmt->fetchAll();
}

$pdo = db();
$method = method();
$menuItemId = isset($_GET['menu_item_id']) ? (int) $_GET['menu_item_id'] : (isset($_GET['product_id']) ? (int) $_GET['product_id'] : null);

if ($method === 'GET') {
    respond_json(['ratings' => fetch_rating_list($pdo, $menuItemId)]);
}

$payload = json_input();

if ($method === 'DELETE') {
    $id = (int) ($payload['id'] ?? ($_GET['id'] ?? 0));
    if ($id <= 0) {
        respond_json(['message' => 'Rating id is required'], 422);
    }

    $stmt = $pdo->prepare('DELETE FROM ratings WHERE id = :id');
    $stmt->execute(['id' => $id]);
    respond_json(['message' => 'Rating deleted']);
}

$menuItemId = (int) ($payload['menu_item_id'] ?? $payload['product_id'] ?? 0);
$rating = (int) ($payload['rating'] ?? 0);
$comment = trim((string) ($payload['comment'] ?? ''));

if ($menuItemId <= 0 || $rating < 1 || $rating > 5 || $comment === '') {
    respond_json(['message' => 'Missing or invalid rating data'], 422);
}

$stmt = $pdo->prepare('INSERT INTO ratings (menu_item_id, rating, comment) VALUES (:menu_item_id, :rating, :comment)');
$stmt->execute([
    'menu_item_id' => $menuItemId,
    'rating' => $rating,
    'comment' => $comment,
]);

respond_json([
    'message' => 'Rating saved',
    'rating' => [
        'id' => (int) $pdo->lastInsertId(),
        'menu_item_id' => $menuItemId,
        'rating' => $rating,
        'comment' => $comment,
    ],
], 201);
