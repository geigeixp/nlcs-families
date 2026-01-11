const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function normalizeFileID(v) {
  const s = String(v || '').trim()
  if (!s) return ''
  if (!s.startsWith('cloud://')) return ''
  return s
}

exports.main = async (event) => {
  const fileIDs = Array.isArray(event && event.fileIDs) ? event.fileIDs : []
  const maxAge = Number(event && event.maxAge ? event.maxAge : 3600) || 3600

  const uniq = []
  const seen = new Set()
  for (const id of fileIDs) {
    const n = normalizeFileID(id)
    if (!n) continue
    if (seen.has(n)) continue
    seen.add(n)
    uniq.push(n)
  }

  if (!uniq.length) return { ok: true, fileList: [] }

  const fileList = []
  const batchSize = 50
  for (let i = 0; i < uniq.length; i += batchSize) {
    const batch = uniq.slice(i, i + batchSize).map(fileID => ({ fileID, maxAge }))
    const res = await cloud.getTempFileURL({ fileList: batch })
    if (res && Array.isArray(res.fileList)) {
      fileList.push(...res.fileList)
    }
  }

  return { ok: true, fileList }
}

