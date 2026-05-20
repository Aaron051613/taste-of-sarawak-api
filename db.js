const { Pool } = require('pg')

let pool

const getPool = () => {
  if (pool) return pool

  const sslEnabled = String(process.env.DB_SSL || '').toLowerCase() === 'true'
  const sslRejectUnauthorized =
    String(process.env.DB_SSL_REJECT_UNAUTHORIZED || '').toLowerCase() === 'true'

  pool = new Pool({
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'taste_of_sarawak',
    max: 10,
    ssl: sslEnabled ? { rejectUnauthorized: sslRejectUnauthorized } : undefined,
  })

  return pool
}

const withTransaction = async (handler) => {
  const connection = await getPool().connect()
  try {
    await connection.query('BEGIN')
    const result = await handler(connection)
    await connection.query('COMMIT')
    return result
  } catch (error) {
    try {
      await connection.query('ROLLBACK')
    } catch (rollbackError) {
      // ignore rollback errors to preserve original failure
    }
    throw error
  } finally {
    connection.release()
  }
}

module.exports = { getPool, withTransaction }
