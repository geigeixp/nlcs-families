const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const commentId = String(event.commentId || '').trim()

  if (!commentId) return { success: false, message: 'missing_commentId' }

  try {
    const likeRes = await db.collection('comment_likes').where({
      commentId,
      openid: OPENID
    }).limit(1).get()

    const alreadyLiked = likeRes.data && likeRes.data.length > 0

    if (alreadyLiked) {
      await db.collection('comment_likes').doc(likeRes.data[0]._id).remove()
      await db.collection('comments').doc(commentId).update({
        data: { likes: _.inc(-1) }
      })
      return { success: true, liked: false }
    }

    await db.collection('comment_likes').add({
      data: {
        commentId,
        openid: OPENID,
        createdAt: db.serverDate()
      }
    })
    await db.collection('comments').doc(commentId).update({
      data: { likes: _.inc(1) }
    })

    return { success: true, liked: true }
  } catch (err) {
    console.error(err)
    return { success: false, message: err.message }
  }
}