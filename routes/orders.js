const { getPool, withTransaction } = require('../db')
const { asyncHandler, floatOrZero, intOrNull, textOrNull } = require('../utils')

const generateOrderCode = () => `SB-${String(Date.now())}`

const fetchOrderItems = async (connection, orderId) => {
  const [rows] = await connection.query(
    'SELECT id, menu_item_id, item_name, size_label, unit_price, quantity, line_total FROM order_items WHERE order_id = ? ORDER BY id ASC',
    [orderId]
  )

  const items = []
  for (const row of rows) {
    const [addons] = await connection.query(
      'SELECT addon_name, addon_price FROM order_item_addons WHERE order_item_id = ? ORDER BY id ASC',
      [Number(row.id)]
    )

    items.push({
      id: Number(row.id),
      menu_item_id: row.menu_item_id !== null ? Number(row.menu_item_id) : null,
      name: row.item_name,
      size: row.size_label,
      unitPrice: Number(row.unit_price),
      quantity: Number(row.quantity),
      lineTotal: Number(row.line_total),
      addons: addons.map((addon) => ({
        name: addon.addon_name,
        price: Number(addon.addon_price),
      })),
    })
  }

  return items
}

const fetchOrder = async (connection, orderId) => {
  const [rows] = await connection.query(
    'SELECT id, order_code, table_number, order_type, status, payment, total, created_at, updated_at FROM orders WHERE id = ? LIMIT 1',
    [orderId]
  )
  const order = rows[0]
  if (!order) return null

  return {
    id: Number(order.id),
    orderCode: order.order_code,
    tableNumber: order.table_number !== null ? Number(order.table_number) : null,
    orderType: order.order_type,
    status: order.status,
    payment: order.payment,
    total: Number(order.total),
    placedAt: order.created_at,
    updatedAt: order.updated_at,
    items: await fetchOrderItems(connection, Number(order.id)),
  }
}

const resolveOrderIdentifier = async (connection, identifier) => {
  const orderId = Number(identifier)
  if (!Number.isNaN(orderId) && orderId > 0) {
    const order = await fetchOrder(connection, orderId)
    if (order) return order
  }

  const orderCode = textOrNull(identifier)
  if (!orderCode) return null

  const [rows] = await connection.query('SELECT id FROM orders WHERE order_code = ? LIMIT 1', [orderCode])
  if (!rows[0]) return null
  return fetchOrder(connection, Number(rows[0].id))
}

const fetchOrderList = async (connection) => {
  const [rows] = await connection.query('SELECT id FROM orders ORDER BY created_at DESC, id DESC')
  const orders = []
  for (const row of rows) {
    const order = await fetchOrder(connection, Number(row.id))
    if (order) orders.push(order)
  }
  return orders
}

const ensureTableOccupied = async (connection, tableNumber, orderType) => {
  if (orderType !== 'dine-in' || !tableNumber) return

  await connection.query(
    'INSERT INTO table_sessions (table_number, status) VALUES (?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status)',
    [tableNumber, 'occupied']
  )
}

const syncTableSessionIfIdle = async (connection, tableNumber) => {
  if (!tableNumber) return

  const [rows] = await connection.query(
    'SELECT COUNT(*) AS active_count FROM orders WHERE table_number = ? AND payment <> ?',
    [tableNumber, 'Paid']
  )
  const activeCount = Number(rows[0]?.active_count || 0)

  const status = activeCount > 0 ? 'occupied' : 'available'
  await connection.query('UPDATE table_sessions SET status = ? WHERE table_number = ?', [status, tableNumber])
}

const addOrderHandler = asyncHandler(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed' })
    return
  }

  const payload = req.body || {}
  const items = Array.isArray(payload.items) ? payload.items : []
  const total = floatOrZero(payload.total || 0)
  const tableNumber = intOrNull(payload.tableNumber || null)
  const orderType = textOrNull(payload.orderType || null) || (tableNumber ? 'dine-in' : 'take-away')
  const orderCode = textOrNull(payload.orderCode || payload.order_code || null) || generateOrderCode()

  if (items.length === 0) {
    res.status(422).json({ message: 'Order items are required' })
    return
  }

  const result = await withTransaction(async (connection) => {
    const [orderResult] = await connection.query(
      'INSERT INTO orders (order_code, table_number, order_type, status, payment, total) VALUES (?, ?, ?, ?, ?, ?)',
      [orderCode, tableNumber, orderType, 'Pending', 'Unpaid', total]
    )

    const orderId = Number(orderResult.insertId)
    const itemSql =
      'INSERT INTO order_items (order_id, menu_item_id, item_name, size_label, unit_price, quantity, line_total) VALUES (?, ?, ?, ?, ?, ?, ?)'
    const addonSql =
      'INSERT INTO order_item_addons (order_item_id, addon_name, addon_price) VALUES (?, ?, ?)'

    for (const item of items) {
      const quantity = Math.max(1, Number(item.quantity || 1))
      const unitPrice = floatOrZero(item.unitPrice || 0)
      const sizeLabel = textOrNull(item.size?.label || item.size_label || item.size || '') || ''
      const name = textOrNull(item.name || item.item?.name || '') || 'Item'
      const menuItemId = intOrNull(item.menu_item_id || item.item?.id || null)
      const lineTotal = floatOrZero(unitPrice * quantity)

      const [itemResult] = await connection.query(itemSql, [
        orderId,
        menuItemId,
        name,
        sizeLabel,
        unitPrice,
        quantity,
        lineTotal,
      ])

      const orderItemId = Number(itemResult.insertId)
      const addons = Array.isArray(item.addons) ? item.addons : []
      for (const addon of addons) {
        await connection.query(addonSql, [
          orderItemId,
          String(addon.name || addon.addon_name || '').trim(),
          floatOrZero(addon.price || addon.addon_price || 0),
        ])
      }
    }

    await ensureTableOccupied(connection, tableNumber, orderType)

    return fetchOrder(connection, orderId)
  })

  res.status(201).json({
    message: 'Order saved',
    order: result,
  })
})

const getOrdersHandler = asyncHandler(async (req, res) => {
  const pool = getPool()
  const method = req.method

  if (method === 'GET') {
    res.json({ orders: await fetchOrderList(pool) })
    return
  }

  const payload = req.body || {}
  const orderIdentifier =
    payload.id || payload.orderCode || payload.order_code || req.query.id || null

  if (method === 'DELETE') {
    const resetAll = Boolean(payload.resetAll || payload.reset_all || false)
    if (resetAll) {
      await withTransaction(async (connection) => {
        await connection.query('DELETE FROM orders')
        await connection.query("UPDATE table_sessions SET status = 'available'")
      })
      res.json({ message: 'All orders reset' })
      return
    }

    if (!orderIdentifier) {
      res.status(422).json({ message: 'Order id is required' })
      return
    }

    const order = await resolveOrderIdentifier(pool, orderIdentifier)
    if (!order) {
      res.status(404).json({ message: 'Order not found' })
      return
    }

    await withTransaction(async (connection) => {
      await connection.query('DELETE FROM orders WHERE id = ?', [order.id])
      if (order.tableNumber !== null) {
        await syncTableSessionIfIdle(connection, order.tableNumber)
      }
    })

    res.json({ message: 'Order deleted' })
    return
  }

  if (!orderIdentifier) {
    res.status(422).json({ message: 'Order id is required' })
    return
  }

  if (method === 'PATCH' || method === 'POST') {
    const order = await resolveOrderIdentifier(pool, orderIdentifier)
    if (!order) {
      res.status(404).json({ message: 'Order not found' })
      return
    }

    const fields = []
    const params = []

    if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
      fields.push('status = ?')
      params.push(String(payload.status))
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'payment')) {
      fields.push('payment = ?')
      params.push(String(payload.payment))
    }

    if (
      Object.prototype.hasOwnProperty.call(payload, 'tableNumber') ||
      Object.prototype.hasOwnProperty.call(payload, 'table_number')
    ) {
      fields.push('table_number = ?')
      params.push(intOrNull(payload.tableNumber || payload.table_number))
    }

    if (
      Object.prototype.hasOwnProperty.call(payload, 'orderType') ||
      Object.prototype.hasOwnProperty.call(payload, 'order_type')
    ) {
      fields.push('order_type = ?')
      params.push(String(payload.orderType || payload.order_type))
    }

    if (fields.length === 0) {
      res.status(422).json({ message: 'No order fields supplied' })
      return
    }

    await withTransaction(async (connection) => {
      await connection.query(`UPDATE orders SET ${fields.join(', ')} WHERE id = ?`, [
        ...params,
        order.id,
      ])
      if (order.tableNumber !== null) {
        await syncTableSessionIfIdle(connection, order.tableNumber)
      }
    })

    const updated = await fetchOrder(pool, order.id)
    res.json({ message: 'Order updated', order: updated })
    return
  }

  res.status(405).json({ message: 'Method not allowed' })
})

module.exports = {
  addOrderHandler,
  getOrdersHandler,
}
