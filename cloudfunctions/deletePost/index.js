const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const postId = String(event.postId || event.id || '').trim()

  if (!postId) {
    return { ok: false, message: 'missing_postId' }
  }

  try {
    const postRes = await db.collection('posts').doc(postId).get()
    const post = postRes.data

    const adminRes = await db.collection('admins').where({ openid: OPENID }).limit(1).get()
    const isAdmin = adminRes.data && adminRes.data.length > 0

    const isOwner = post && (post.openid === OPENID || post._openid === OPENID)
    if (!isOwner && !isAdmin) {
      return { ok: false, message: 'forbidden' }
    }

    await db.collection('posts').doc(postId).update({
      data: {
        status: 'deleted',
        deletedAt: db.serverDate(),
        deletedBy: OPENID
      }
    })

    return { ok: true }
  } catch (err) {
    console.error(err)
    return { ok: false, message: err.message }
  }
}
