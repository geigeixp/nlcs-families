const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

async function getTempUrlMap(fileIDs) {
  const uniq = Array.from(new Set(
    (fileIDs || [])
      .map(x => String(x || '').trim())
      .filter(x => x.startsWith('cloud://'))
  ))
  if (!uniq.length) return {}

  const map = {}
  const batchSize = 50
  for (let i = 0; i < uniq.length; i += batchSize) {
    const batch = uniq.slice(i, i + batchSize).map(fileID => ({ fileID, maxAge: 3600 }))
    const res = await cloud.getTempFileURL({ fileList: batch })
    for (const item of (res.fileList || [])) {
      if (item && item.fileID && item.tempFileURL) {
        map[item.fileID] = item.tempFileURL
      }
    }
  }
  return map
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const postId = String((event && event.postId) || '').trim()
  if (!postId) return { ok: false, message: 'missing_postId' }

  try {
    const postRes = await db.collection('posts').doc(postId).get()
    const post = postRes && postRes.data ? postRes.data : null
    if (!post) return { ok: false, message: 'not_found' }

    // Check if user is admin
    const adminRes = await db.collection('admins').where({ openid: OPENID }).limit(1).get()
    const isAdmin = adminRes.data && adminRes.data.length > 0

    const isOwner = post._openid === OPENID || post.openid === OPENID
    if (!isOwner && !isAdmin) return { ok: false, message: 'forbidden' }

    const images = Array.isArray(post.images) ? post.images : []
    const urlMap = await getTempUrlMap(images)
    const imagesResolved = images.map(x => urlMap[x] || x)

    return {
      ok: true,
      data: {
        _id: post._id,
        content: post.content || '',
        category: post.category || '',
        images: imagesResolved
      }
    }
  } catch (err) {
    console.error(err)
    return { ok: false, message: err.message }
  }
}
