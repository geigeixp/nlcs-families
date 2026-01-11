const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// Helper to build display name from application data
function buildDisplayName(student, siblings = []) {
  if (!student) return ''
  let name = student.englishName || student.chineseName || '家长'

  // Add siblings
  if (Array.isArray(siblings) && siblings.length > 0) {
    const siblingNames = siblings.map(s => {
      return s.englishName || s.chineseName || ''
    }).filter(n => n)
    
    if (siblingNames.length > 0) {
      name += ` & ${siblingNames.join(' & ')}`
    }
  }

  const relationRaw = String(student.relation || '').trim()
  const relation = relationRaw === '其他' ? String(student.relationOther || '').trim() : relationRaw
  const relationText = relation === '父亲' ? '爸爸' : (relation === '母亲' ? '妈妈' : relation)
  if (relationText) {
    name += ` ${relationText}`
  }
  return name
}

function getAuthorName(app) {
  if (!app) return 'Anonymous'
  if (app.student) {
    return buildDisplayName(app.student, app.siblings)
  } else if (app.profile) {
    return app.profile.nickName || 'Parent'
  }
  return 'User'
}

function getAuthorAvatar(app) {
  if (app && app.profile && app.profile.avatarUrl) {
    return app.profile.avatarUrl
  }
  return '/images/default-avatar.png'
}

exports.main = async (event, context) => {
  const { postId, page = 1, pageSize = 20 } = event
  const { OPENID } = cloud.getWXContext()

  if (!postId) {
    return { success: false, message: 'Missing postId' }
  }

  try {
    const skip = (page - 1) * pageSize
    
    // 1. Fetch comments
    const res = await db.collection('comments')
      .where({ postId: postId })
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()
    
    let comments = res.data

    // 2. Collect unique openids from comments
    const userOpenids = Array.from(new Set(comments.map(c => c._openid).filter(id => id)))
    
    // 3. Batch fetch user info from applications collection
    let userMap = {}
    if (userOpenids.length > 0) {
      try {
        const appRes = await db.collection('applications')
          .where(_.or([
            { openid: _.in(userOpenids) },
            { _openid: _.in(userOpenids) }
          ]))
          .limit(100) // Max limit for safety
          .get()
        
        appRes.data.forEach(app => {
          // Map both openid and _openid to the app record
          if (app.openid) userMap[app.openid] = app
          if (app._openid) userMap[app._openid] = app
        })
      } catch (err) {
        console.error('Error fetching user info:', err)
      }
    }

    // 4. Check admin status
    let isAdmin = false
    try {
        const adminRes = await db.collection('admins').where({ openid: OPENID }).get()
        if (adminRes.data.length > 0) {
            isAdmin = true
        }
    } catch(e) {}

    // 4.5 Check liked status
    let likedCommentIds = new Set()
    if (comments.length > 0) {
      try {
        const commentIds = comments.map(c => c._id)
        const likeRes = await db.collection('comment_likes')
          .where({
            commentId: _.in(commentIds),
            openid: OPENID
          })
          .get()
        likeRes.data.forEach(like => likedCommentIds.add(like.commentId))
      } catch (e) {
        console.error('Error fetching comment likes:', e)
      }
    }

    // 5. Merge user info and format comments
    comments = comments.map(comment => {
      const app = userMap[comment._openid]
      
      // Use latest info from application if available, otherwise fallback to stored info
      if (app) {
        comment.author = getAuthorName(app)
        comment.avatar = getAuthorAvatar(app)
      } else {
        // Fallback for historical data if not found in applications (e.g. deleted user)
        comment.author = comment.author || 'Anonymous'
        comment.avatar = comment.avatar || '/images/default-avatar.png'
      }

      comment.isMine = comment._openid === OPENID
      comment.canDelete = isAdmin || comment.isMine
      comment.isLiked = likedCommentIds.has(comment._id)
      return comment
    })

    return { success: true, data: comments }
  } catch (e) {
    console.error(e)
    return { success: false, message: e.message }
  }
}
