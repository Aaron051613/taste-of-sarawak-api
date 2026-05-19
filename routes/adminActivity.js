const { getPool } = require('../db')
const { asyncHandler } = require('../utils')

const handler = asyncHandler(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed' })
    return
  }

  const payload = req.body || {}
  const action = String(payload.action || '').trim()
  const actorName = String(payload.actorName || '').trim()
  const actorEmail = String(payload.actorEmail || '').trim()
  const details = payload.details && typeof payload.details === 'object' ? payload.details : null

  if (!action) {
    res.status(422).json({ message: 'Action is required' })
    return
  }

  const pool = getPool()
  await pool.query(
    'INSERT INTO admin_activity_logs (action, actor_name, actor_email, details) VALUES (?, ?, ?, ?)',
    [action, actorName, actorEmail, details]
  )

  res.status(201).json({ message: 'Activity logged' })
})

module.exports = handler
