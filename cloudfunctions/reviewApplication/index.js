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

  const targetOpenid = String(event.targetOpenid || '').trim()
  const decision = String(event.decision || '').trim()
  const reviewNote = String(event.reviewNote || '').trim()

  if (!targetOpenid) return { ok: false, message: 'missing_targetOpenid' }
  if (decision !== 'approved' && decision !== 'rejected') return { ok: false, message: 'invalid_decision' }

  const update = {
    status: decision,
    reviewedAt: Date.now(),
    reviewNote: decision === 'rejected' ? reviewNote : ''
  }
  await db.collection('applications').doc(targetOpenid).update({ data: update })
  const updated = await db.collection('applications').doc(targetOpenid).get()
  return { ok: true, application: updated.data }
}

