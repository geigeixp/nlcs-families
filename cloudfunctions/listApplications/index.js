const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

async function isAdmin(db, openid) {
  const res = await db.collection('admins').where({ openid }).limit(1).get()
  return res.data && res.data.length > 0
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const db = cloud.database()

  const ok = await isAdmin(db, OPENID)
  if (!ok) return { ok: false, message: 'forbidden' }

  const status = String(event.status || 'pending').trim()
  const limit = Math.max(1, Math.min(50, Number(event.limit || 20)))
  const skip = Math.max(0, Number(event.skip || 0) || 0)
  const res = await db.collection('applications')
    .where({ status })
    .orderBy('submittedAt', 'desc')
    .skip(skip)
    .limit(limit)
    .get()
  return { ok: true, applications: res.data || [] }
}
