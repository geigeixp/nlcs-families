const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const postId = String(event.postId || '').trim()

  if (!postId) return { ok: false, message: 'missing_postId' }

  try {
    const likeRes = await db.collection('post_likes').where({
      postId,
      openid: OPENID
    }).limit(1).get()

    const alreadyLiked = likeRes.data && likeRes.data.length > 0

    if (alreadyLiked) {
      await db.collection('post_likes').doc(likeRes.data[0]._id).remove()
      await db.collection('posts').doc(postId).update({
        data: {
          likes: _.inc(-1)
        }
      })
      return { ok: true, liked: false }
    }

    await db.collection('post_likes').add({
      data: {
        postId,
        openid: OPENID,
        createdAt: db.serverDate()
      }
    })
    await db.collection('posts').doc(postId).update({
      data: {
        likes: _.inc(1)
      }
    })

    return { ok: true, liked: true }
  } catch (err) {
    console.error(err)
    return { ok: false, message: err.message }
  }
}

