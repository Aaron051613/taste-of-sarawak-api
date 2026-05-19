const { getPool } = require('../db')
const { asyncHandler } = require('../utils')

const fetchRatingList = async (connection, menuItemId) => {
  if (menuItemId) {
    const [rows] = await connection.query(
      'SELECT id, menu_item_id, rating, comment, created_at FROM ratings WHERE menu_item_id = ? ORDER BY created_at DESC, id DESC',
      [menuItemId]
    )
    return rows
  }

  const [rows] = await connection.query(
    'SELECT id, menu_item_id, rating, comment, created_at FROM ratings ORDER BY created_at DESC, id DESC'
  )
  return rows
}

const handler = asyncHandler(async (req, res) => {
  const pool = getPool()
  const menuItemId = req.query.menu_item_id
    ? Number(req.query.menu_item_id)
    : req.query.product_id
    ? Number(req.query.product_id)
    : null

  if (req.method === 'GET') {
    res.json({ ratings: await fetchRatingList(pool, menuItemId) })
    return
  }

  const payload = req.body || {}

  if (req.method === 'DELETE') {
    const id = Number(payload.id || req.query.id || 0)
    if (!id) {
      res.status(422).json({ message: 'Rating id is required' })
      return
    }

    await pool.query('DELETE FROM ratings WHERE id = ?', [id])
    res.json({ message: 'Rating deleted' })
    return
  }

  const targetMenuId = Number(payload.menu_item_id || payload.product_id || 0)
  const rating = Number(payload.rating || 0)
  const comment = String(payload.comment || '').trim()

  if (!targetMenuId || rating < 1 || rating > 5 || !comment) {
    res.status(422).json({ message: 'Missing or invalid rating data' })
    return
  }

  const [result] = await pool.query(
    'INSERT INTO ratings (menu_item_id, rating, comment) VALUES (?, ?, ?)',
    [targetMenuId, rating, comment]
  )

  res.status(201).json({
    message: 'Rating saved',
    rating: {
      id: Number(result.insertId),
      menu_item_id: targetMenuId,
      rating,
      comment,
    },
  })
})

module.exports = handler
