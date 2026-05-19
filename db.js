const mysql = require('mysql2/promise')

let pool

const getPool = () => {
  if (pool) return pool

  pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'taste_of_sarawak',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
  })

  return pool
}

const withTransaction = async (handler) => {
  const connection = await getPool().getConnection()
  try {
    await connection.beginTransaction()
    const result = await handler(connection)
    await connection.commit()
    return result
  } catch (error) {
    try {
      await connection.rollback()
    } catch (rollbackError) {
      // ignore rollback errors to preserve original failure
    }
    throw error
  } finally {
    connection.release()
  }
}

module.exports = { getPool, withTransaction }
