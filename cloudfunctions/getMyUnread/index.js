const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const perPostSince = (event && event.perPostSince && typeof event.perPostSince === 'object') ? event.perPostSince : null
  let since = Number(event && event.since ? event.since : 0) || 0
  
  if (perPostSince) {
    const times = Object.values(perPostSince)
      .map(x => Number(x) || 0)
      .filter(x => x > 0)
    if (times.length) since = Math.min(...times)
  }
  const sinceDate = new Date(since)

  try {
    // Check admin pending count
    let pendingCount = 0
    try {
      const adminRes = await db.collection('admins').where({ openid: OPENID }).limit(1).get()
      if (adminRes.data && adminRes.data.length > 0) {
        const pendingRes = await db.collection('applications').where({ status: 'pending' }).count()
        pendingCount = pendingRes.total || 0
      }
    } catch (e) {
      console.error('Check admin pending failed', e)
    }

    const postsRes = await db.collection('posts')
      .where(_.and([
        _.or([
          { openid: OPENID },
          { _openid: OPENID }
        ]),
        { status: 'published' }
      ]))
      .field({ _id: true })
      .limit(200)
      .get()

    const postIds = (postsRes.data || []).map(p => p._id).filter(Boolean)
    if (!postIds.length) {
      return { 
        ok: true, 
        hasUnread: pendingCount > 0, 
        hasUnreadMessages: false,
        likes: 0, 
        comments: 0, 
        pendingCount, 
        perPost: {} 
      }
    }

    const likesRes = await db.collection('post_likes')
      .where({
        postId: _.in(postIds),
        openid: _.neq(OPENID),
        createdAt: _.gt(sinceDate)
      })
      .limit(500)
      .get()

    const commentsRes = await db.collection('comments')
      .where({
        postId: _.in(postIds),
        _openid: _.neq(OPENID),
        createTime: _.gt(sinceDate)
      })
      .limit(500)
      .get()

    const likesList = likesRes.data || []
    const commentsList = commentsRes.data || []

    const perPost = {}
    let likes = 0
    for (const x of likesList) {
      const pid = x.postId
      if (!pid) continue
      if (perPostSince && perPostSince[pid]) {
        const createdAtMs = (x.createdAt instanceof Date) ? x.createdAt.getTime() : new Date(x.createdAt).getTime()
        if (!(createdAtMs > Number(perPostSince[pid] || 0))) continue
      }
      if (!perPost[pid]) perPost[pid] = { likes: 0, comments: 0, total: 0 }
      perPost[pid].likes += 1
      perPost[pid].total += 1
      likes += 1
    }
    let comments = 0
    for (const x of commentsList) {
      const pid = x.postId
      if (!pid) continue
      if (perPostSince && perPostSince[pid]) {
        const createdAtMs = (x.createTime instanceof Date) ? x.createTime.getTime() : new Date(x.createTime).getTime()
        if (!(createdAtMs > Number(perPostSince[pid] || 0))) continue
      }
      if (!perPost[pid]) perPost[pid] = { likes: 0, comments: 0, total: 0 }
      perPost[pid].comments += 1
      perPost[pid].total += 1
      comments += 1
    }

    return {
      ok: true,
      hasUnread: (likes + comments > 0) || (pendingCount > 0),
      hasUnreadMessages: (likes + comments > 0),
      likes,
      comments,
      pendingCount,
      perPost
    }
  } catch (err) {
    console.error(err)
    return { ok: false, message: err.message }
  }
}
