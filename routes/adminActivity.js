const { asyncHandler } = require('../utils')

const handler = asyncHandler(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed' })
    return
  }

  res.status(204).end()
})

module.exports = handler
