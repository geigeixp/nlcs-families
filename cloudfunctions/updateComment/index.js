const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { commentId, content } = event

  if (!commentId || !content) return { success: false, message: 'Missing parameters' }

  try {
    const commentRes = await db.collection('comments').doc(commentId).get()
    const comment = commentRes.data

    if (comment._openid !== OPENID) {
      return { success: false, message: 'Permission denied' }
    }

    await db.collection('comments').doc(commentId).update({
      data: {
        content: content,
        updateTime: db.serverDate()
      }
    })

    return { success: true }
  } catch (e) {
    console.error(e)
    return { success: false, message: e.message }
  }
}