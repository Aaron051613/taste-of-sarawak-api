const clients = new Set()

const addClient = (res) => {
  clients.add(res)
  res.on('close', () => {
    clients.delete(res)
  })
}

const broadcastOrderEvent = (event, payload = {}) => {
  const data = JSON.stringify({ event, ...payload })
  for (const res of clients) {
    res.write(`data: ${data}\n\n`)
  }
}

const startHeartbeat = (res) => {
  const timer = setInterval(() => {
    res.write(': keep-alive\n\n')
  }, 25000)

  res.on('close', () => clearInterval(timer))
}

module.exports = { addClient, broadcastOrderEvent, startHeartbeat }
