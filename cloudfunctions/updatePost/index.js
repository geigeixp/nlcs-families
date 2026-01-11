const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const postId = String((event && event.postId) || '').trim()
  const content = String((event && event.content) || '').trim()
  const category = String((event && event.category) || '').trim()

  if (!postId) return { ok: false, message: 'missing_postId' }
  if (content.length > 5000) return { ok: false, message: 'content_too_long' }

  try {
    const postRes = await db.collection('posts').doc(postId).get()
    const post = postRes && postRes.data ? postRes.data : null
    if (!post) return { ok: false, message: 'not_found' }

    const isOwner = post._openid === OPENID || post.openid === OPENID
    if (!isOwner) return { ok: false, message: 'forbidden' }

    const hasImages = Array.isArray(post.images) && post.images.length > 0
    if (!content && !hasImages) return { ok: false, message: 'missing_content' }

    await db.collection('posts').doc(postId).update({
      data: {
        content,
        category,
        editedAt: db.serverDate(),
        editedBy: OPENID
      }
    })

    return { ok: true }
  } catch (err) {
    console.error(err)
    return { ok: false, message: err.message }
  }
}
