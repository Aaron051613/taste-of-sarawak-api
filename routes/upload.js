const crypto = require('crypto')
const path = require('path')
const multer = require('multer')
const { createClient } = require('@supabase/supabase-js')
const { asyncHandler } = require('../utils')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

// Store file in memory instead of local disk
const storage = multer.memoryStorage()
const upload = multer({ storage })

const handler = asyncHandler(async (req, res) => {
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ message: 'Supabase config missing' })
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const file = req.file || (Array.isArray(req.files) ? req.files[0] : null)
  if (!file) {
    return res.status(422).json({
      message: 'No image uploaded',
      fields: Object.keys(req.body || {}),
    })
  }

  const original = path.basename(file.originalname || '')
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
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
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