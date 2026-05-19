const { getPool } = require('../db')
const { asyncHandler, intOrNull, textOrNull } = require('../utils')

const fetchTableOverview = async (connection) => {
  const tableRows = []
  for (let tableNumber = 1; tableNumber <= 10; tableNumber += 1) {
    const [rows] = await connection.query(
      'SELECT table_number, status FROM table_sessions WHERE table_number = ? LIMIT 1',
      [tableNumber]
    )
    const session = rows[0] || { table_number: tableNumber, status: 'available' }

    tableRows.push({
      tableNumber,
      status: String(session.status || 'available'),
    })
  }

  return tableRows
}

const ensureTableOccupied = async (connection, tableNumber) => {
  if (!tableNumber) return

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

const handler = asyncHandler(async (req, res) => {
  const pool = getPool()

  if (req.method === 'GET') {
    res.json({ tables: await fetchTableOverview(pool) })
    return
  }

  const payload = req.body || {}
  const tableNumber = intOrNull(payload.tableNumber || payload.table_number || null)
  const action = String(payload.action || '').toLowerCase()
  const orderType = textOrNull(payload.orderType || payload.order_type || null) || 'dine-in'

  if (!tableNumber || tableNumber < 1 || tableNumber > 10) {
    res.status(422).json({ message: 'Valid table number is required' })
    return
  }

  if (action === 'occupy') {
    if (orderType === 'dine-in') {
      await ensureTableOccupied(pool, tableNumber)
    }
    res.json({ message: 'Table marked occupied', tables: await fetchTableOverview(pool) })
    return
  }

  if (action === 'release') {
    await syncTableSessionIfIdle(pool, tableNumber)
    res.json({ message: 'Table released if idle', tables: await fetchTableOverview(pool) })
    return
  }

  res.status(422).json({ message: 'Unsupported table action' })
})

module.exports = handler
