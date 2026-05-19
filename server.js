require('dotenv').config()

const path = require('path')
const express = require('express')
const cors = require('cors')

const authHandler = require('./routes/auth')
const menuHandler = require('./routes/menu')
const { addOrderHandler, getOrdersHandler } = require('./routes/orders')
const ratingsHandler = require('./routes/ratings')
const tablesHandler = require('./routes/tables')
const { handler: uploadHandler, upload } = require('./routes/upload')
const adminActivityHandler = require('./routes/adminActivity')

const app = express()

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}))
app.use(express.json({ limit: '2mb' }))

app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.all('/auth.php', authHandler)
app.all('/menu.php', menuHandler)
app.all('/addOrder.php', addOrderHandler)
app.all('/getOrders.php', getOrdersHandler)
app.all('/ratings.php', ratingsHandler)
app.all('/tables.php', tablesHandler)
app.post('/upload.php', upload.single('image'), uploadHandler)
app.all('/adminActivity.php', adminActivityHandler)

app.use((err, req, res, next) => {
  const status = err.statusCode || err.status || 500
  res.status(status).json({ message: err.message || 'Server error' })
})

const port = Number(process.env.PORT || 3000)
app.listen(port, () => {
  console.log(`Taste API running on port ${port}`)
})
