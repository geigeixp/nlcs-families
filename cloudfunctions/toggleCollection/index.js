const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const type = String(event.type || 'post').trim() // 'post' or 'comment'
  const targetId = String(event.targetId || '').trim() // postId or commentId
  const postId = String(event.postId || '').trim() // useful when type='comment'

  if (!targetId) return { ok: false, message: 'missing_targetId' }
  if (type !== 'post' && type !== 'comment') return { ok: false, message: 'invalid_type' }
  if (type === 'comment' && !postId) return { ok: false, message: 'missing_postId_for_comment' }

  try {
    const collectionRes = await db.collection('favorites').where({
      openid: OPENID,
      type,
      targetId
    }).limit(1).get()

    const alreadyCollected = collectionRes.data && collectionRes.data.length > 0

    if (alreadyCollected) {
      await db.collection('favorites').doc(collectionRes.data[0]._id).remove()
      return { ok: true, collected: false }
    }

    const data = {
      openid: OPENID,
      type,
      targetId,
      createdAt: db.serverDate()
    }
    if (type === 'comment') {
      data.postId = postId
    }

    await db.collection('favorites').add({ data })
    return { ok: true, collected: true }

  } catch (err) {
    console.error(err)
    return { ok: false, message: err.message }
  }
}
