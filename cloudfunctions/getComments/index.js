const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// Helper to build display name from application data
function getAuthorName(app) {
  if (!app) return 'Anonymous'
  if (app.student) {
    let name = app.student.englishName || app.student.name || 'Parent'
    if (app.student.chineseName) {
      name += ` (${app.student.chineseName})`
    }
    return name
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
      return comment
    })

    return { success: true, data: comments }
  } catch (e) {
    console.error(e)
    return { success: false, message: e.message }
  }
}
