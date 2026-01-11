const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { commentId } = event

  if (!commentId) {
    return { success: false, message: 'Missing commentId' }
  }

  try {
    // 1. Get comment to check permission
    const commentRes = await db.collection('comments').doc(commentId).get()
    const comment = commentRes.data
    
    let canDelete = false
    if (comment._openid === OPENID) {
      canDelete = true
    } else {
      // Check admin
      const adminRes = await db.collection('admins').where({ openid: OPENID }).get()
      if (adminRes.data.length > 0) {
        canDelete = true
      }
    }

    if (!canDelete) {
      return { success: false, message: 'Permission denied' }
    }

    // 2. Delete comment
    await db.collection('comments').doc(commentId).remove()

    // 3. Update post comment count
    await db.collection('posts').doc(comment.postId).update({
      data: {
        comments: _.inc(-1)
      }
    })

    return { success: true }
  } catch (e) {
    console.error(e)
    return { success: false, message: e.message }
  }
}