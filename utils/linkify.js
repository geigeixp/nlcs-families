function normalizeUrl(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  if (/^www\./i.test(s)) return `https://${s}`
  return s
}

function parseTextLinks(text) {
  const input = String(text || '')
  if (!input) return []

  const pattern = /((?:https?:\/\/|www\.)[^\s<>()]+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g
  const parts = []
  let lastIndex = 0

  for (;;) {
    const match = pattern.exec(input)
    if (!match) break

    const start = match.index
    const end = start + match[0].length

    if (start > lastIndex) {
      parts.push({ type: 'text', text: input.slice(lastIndex, start) })
    }

    if (match[1]) {
      const rawUrl = match[1]
      parts.push({ type: 'url', text: rawUrl, href: normalizeUrl(rawUrl) })
    } else if (match[2]) {
      const email = match[2]
      parts.push({ type: 'email', text: email, href: email })
    }

    lastIndex = end
  }

  if (lastIndex < input.length) {
    parts.push({ type: 'text', text: input.slice(lastIndex) })
  }

  return parts.length ? parts : [{ type: 'text', text: input }]
}

module.exports = {
  parseTextLinks,
  normalizeUrl
}

