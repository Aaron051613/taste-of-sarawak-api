const textOrNull = (value) => {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

const floatOrZero = (value) => {
  const number = Number(value)
  if (Number.isNaN(number)) return 0
  return Math.round(number * 100) / 100
}

const intOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  if (Number.isNaN(number)) return null
  return Math.trunc(number)
}

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

module.exports = { textOrNull, floatOrZero, intOrNull, asyncHandler }
