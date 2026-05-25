const crypto = require('crypto')
const path = require('path')
const multer = require('multer')
const { createClient } = require('@supabase/supabase-js')
const { asyncHandler } = require('../utils')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

// Store file in memory instead of local disk
const storage = multer.memoryStorage()
const upload = multer({ storage })

const handler = asyncHandler(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  if (!req.file) {
    return res.status(422).json({ message: 'No image uploaded' })
  }

  const original = path.basename(req.file.originalname || '')
  const ext = path.extname(original)
  const base = path.basename(original, ext)

  const safeBase = base.replace(/[^A-Za-z0-9-_]/g, '-')

  const timestamp = Date.now()
  const random = crypto.randomBytes(4).toString('hex')

  const filename =
    `${safeBase}_${timestamp}_${random}${ext}`.toLowerCase()

  const filePath = `menus/${filename}`

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from('menu-images')
    .upload(filePath, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false,
    })

  if (error) {
    console.error(error)
    return res.status(500).json({
      message: 'Upload failed',
      error: error.message,
    })
  }

  // Public image URL
  const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/menu-images/${filePath}`

  return res.status(201).json({
    message: 'Uploaded',
    path: filePath,
    url: publicUrl,
  })
})

module.exports = { handler, upload }