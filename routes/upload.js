const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const multer = require('multer')
const { asyncHandler } = require('../utils')

const uploadsDir = path.join(__dirname, '..', 'uploads')

const ensureUploadsDir = () => {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      ensureUploadsDir()
      cb(null, uploadsDir)
    } catch (error) {
      cb(error)
    }
  },
  filename: (req, file, cb) => {
    const original = path.basename(file.originalname || '')
    const ext = path.extname(original)
    const base = path.basename(original, ext)
    const safeBase = base.replace(/[^A-Za-z0-9-_]/g, '-')
    const timestamp = Date.now()
    const random = crypto.randomBytes(4).toString('hex')
    const filename = `${safeBase}_${timestamp}_${random}${ext}`.toLowerCase()
    cb(null, filename)
  },
})

const upload = multer({ storage })

const handler = asyncHandler(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed' })
    return
  }

  if (!req.file) {
    res.status(422).json({ message: 'No image uploaded' })
    return
  }

  const filename = req.file.filename
  const baseUrl = `${req.protocol}://${req.get('host')}`
  const url = `${baseUrl}/uploads/${filename}`

  res.status(201).json({
    message: 'Uploaded',
    path: `/uploads/${filename}`,
    url,
  })
})

module.exports = { handler, upload }
