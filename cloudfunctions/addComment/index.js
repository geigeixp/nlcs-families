const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { postId, content } = event

  if (!postId || !content) {
    return { success: false, message: 'Missing parameters' }
  }

  // 1. Get user info
  let authorName = 'Anonymous'
  let authorAvatar = '/images/default-avatar.png'
  
  try {
    // 优先查询 applications 集合 (项目主数据源)
    // 注意：submitApplication 中使用的是 openid 字段，这里同时匹配 openid 和 _openid 以防万一
    const appRes = await db.collection('applications').where(
      _.or([
        { openid: OPENID },
        { _openid: OPENID }
      ])
    ).get()
    
    if (appRes.data.length > 0) {
      const app = appRes.data[0]
      
      // 检查账号状态
      if (app.status === 'revoked' || app.status === 'rejected') {
         return { success: false, message: 'Account revoked' }
      }

      // 提取名字
      if (app.student) {
          authorName = app.student.englishName || app.student.name || 'Parent'
          if (app.student.chineseName) {
              authorName += ` (${app.student.chineseName})`
          }
      } else if (app.profile) {
          authorName = app.profile.nickName || 'Parent'
          authorAvatar = app.profile.avatarUrl || '/images/default-avatar.png'
      }
    } else {
      // 如果 applications 没找到，尝试查 users (作为备选，且容错处理)
      try {
        const userRes = await db.collection('users').where({ _openid: OPENID }).get()
        if (userRes.data.length > 0) {
          const user = userRes.data[0]
          authorName = user.nickName || user.englishName || user.name || 'User'
          authorAvatar = user.avatarUrl || '/images/default-avatar.png'
          
          if (user.status === 'revoked') {
            return { success: false, message: 'Account revoked' }
          }
        }
      } catch (err) {
        // 忽略 users 集合不存在的错误
        console.log('users collection lookup failed (non-critical):', err)
      }
    }
  } catch (e) {
    console.error('Error fetching user info:', e)
  }

  // 2. Add comment
  try {
    const res = await db.collection('comments').add({
      data: {
        _openid: OPENID,
        postId: postId,
        content: content,
        createTime: db.serverDate(),
        author: authorName,
        avatar: authorAvatar,
        likes: 0
      }
    })

    // 3. Update post comment count
    await db.collection('posts').doc(postId).update({
      data: {
        comments: _.inc(1)
      }
    })

    return { success: true, data: res }
  } catch (e) {
    console.error(e)
    return { success: false, message: e.message }
  }
}