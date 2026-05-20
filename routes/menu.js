const { getPool, withTransaction } = require('../db')
const { asyncHandler, floatOrZero } = require('../utils')

const fetchMenuSizes = async (connection, menuItemId) => {
  const result = await connection.query(
    'SELECT label, price FROM menu_sizes WHERE menu_item_id = $1 ORDER BY sort_order, id',
    [menuItemId]
  )
  return result.rows.map((row) => ({
    label: row.label,
    price: Number(row.price),
  }))
}

const fetchMenuAddons = async (connection, menuItemId) => {
  const result = await connection.query(
    'SELECT name, price FROM menu_addons WHERE menu_item_id = $1 ORDER BY sort_order, id',
    [menuItemId]
  )
  return result.rows.map((row) => ({
    name: row.name,
    price: Number(row.price),
  }))
}

const fetchMenuDrinkOptions = async (connection, menuItemId) => {
  const result = await connection.query(
    'SELECT label FROM menu_drink_options WHERE menu_item_id = $1 ORDER BY sort_order, id',
    [menuItemId]
  )
  return result.rows.map((row) => row.label)
}

const fetchMenuItem = async (connection, id) => {
  const result = await connection.query('SELECT * FROM menu_items WHERE id = $1 LIMIT 1', [id])
  const item = result.rows[0]
  if (!item) return null

  return {
    id: Number(item.id),
    name: item.name,
    category: item.category,
    description: item.description,
    image: item.image,
    sizes: await fetchMenuSizes(connection, id),
    addons: await fetchMenuAddons(connection, id),
    drinkOptions: await fetchMenuDrinkOptions(connection, id),
  }
}

const fetchMenuItems = async (connection) => {
  const result = await connection.query(
    'SELECT id, name, category, description, image FROM menu_items WHERE active = true ORDER BY sort_order, id'
  )

  const items = []
  for (const row of result.rows) {
    const id = Number(row.id)
    items.push({
      id,
      name: row.name,
      category: row.category,
      description: row.description,
      image: row.image,
      sizes: await fetchMenuSizes(connection, id),
      addons: await fetchMenuAddons(connection, id),
      drinkOptions: await fetchMenuDrinkOptions(connection, id),
    })
  }

  return items
}

const saveMenuChildren = async (connection, menuItemId, payload) => {
  await connection.query('DELETE FROM menu_sizes WHERE menu_item_id = $1', [menuItemId])
  await connection.query('DELETE FROM menu_addons WHERE menu_item_id = $1', [menuItemId])
  await connection.query('DELETE FROM menu_drink_options WHERE menu_item_id = $1', [menuItemId])

  const sizes = Array.isArray(payload.sizes) ? payload.sizes : []
  for (const [index, size] of sizes.entries()) {
    await connection.query(
      'INSERT INTO menu_sizes (menu_item_id, label, price, sort_order) VALUES ($1, $2, $3, $4)',
      [
        menuItemId,
        String(size.label || '').trim(),
        floatOrZero(size.price || 0),
        index + 1,
      ]
    )
  }

  if (payload.category !== 'Drinks') {
    const addons = Array.isArray(payload.addons) ? payload.addons : []
    for (const [index, addon] of addons.entries()) {
      await connection.query(
        'INSERT INTO menu_addons (menu_item_id, name, price, sort_order) VALUES ($1, $2, $3, $4)',
        [
          menuItemId,
          String(addon.name || '').trim(),
          floatOrZero(addon.price || 0),
          index + 1,
        ]
      )
    }
  }

  const drinkOptions = Array.isArray(payload.drinkOptions) ? payload.drinkOptions : []
  for (const [index, option] of drinkOptions.entries()) {
    const label = String(option || '').trim()
    if (!label) continue

    await connection.query(
      'INSERT INTO menu_drink_options (menu_item_id, label, sort_order) VALUES ($1, $2, $3)',
      [menuItemId, label, index + 1]
    )
  }
}

const handler = asyncHandler(async (req, res) => {
  const pool = getPool()
  const id = req.query.id ? Number(req.query.id) : null

  if (req.method === 'GET') {
    if (id) {
      const item = await fetchMenuItem(pool, id)
      if (!item) {
        res.status(404).json({ message: 'Menu item not found' })
        return
      }
      res.json({ item })
      return
    }

    res.json({ items: await fetchMenuItems(pool) })
    return
  }

  const payload = req.body || {}
  const name = String(payload.name || '').trim()
  const category = String(payload.category || '').trim()
  const description = String(payload.description || '').trim()
  const image = String(payload.image || '').trim()
  const sizes = Array.isArray(payload.sizes) ? payload.sizes : []

  if (!name || !category || !description || !image || sizes.length === 0) {
    res.status(422).json({ message: 'Missing menu item fields' })
    return
  }

  const result = await withTransaction(async (connection) => {
    if (req.method === 'DELETE') {
      const targetId = Number(req.query.id || payload.id || 0)
      if (!targetId) {
        throw new Error('Menu item id is required')
      }

      await connection.query('DELETE FROM menu_items WHERE id = $1', [targetId])
      return { status: 200, payload: { message: 'Menu item deleted' } }
    }

    if (req.method === 'PATCH' || req.method === 'POST') {
      if (req.method === 'PATCH' && payload.id) {
        const targetId = Number(payload.id)
        await connection.query(
          'UPDATE menu_items SET name = $1, category = $2, description = $3, image = $4, updated_at = NOW() WHERE id = $5',
          [name, category, description, image, targetId]
        )
        await saveMenuChildren(connection, targetId, payload)
        return { status: 200, payload: { item: await fetchMenuItem(connection, targetId) } }
      }

      const result = await connection.query(
        'INSERT INTO menu_items (name, category, description, image, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [name, category, description, image, Number(payload.sort_order || 0)]
      )
      const targetId = Number(result.rows[0].id)
      await saveMenuChildren(connection, targetId, payload)
      return { status: 201, payload: { item: await fetchMenuItem(connection, targetId) } }
    }

    throw new Error('Unsupported method')
  })

  res.status(result.status).json(result.payload)
})

module.exports = handler
