const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const DEFAULT_AVATAR = '/images/default-avatar.png'

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

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()

  const content = String(event.content || '').trim()
  if (content.length > 5000) {
    return { success: false, message: 'content_too_long' }
  }

  let author = ''
  let avatar = ''

  try {
    const appRes = await db.collection('applications').where({ openid: OPENID }).limit(1).get()
    if (appRes.data && appRes.data.length) {
      const application = appRes.data[0]
      author = buildDisplayName(application.student, application.siblings)
      avatar = (application.profile && application.profile.avatarUrl) ? application.profile.avatarUrl : ''
    }
  } catch (err) {
    console.error(err)
  }

  if (!author && event.userInfo && event.userInfo.nickName) {
    author = String(event.userInfo.nickName)
  }
  if (!avatar && event.userInfo && event.userInfo.avatarUrl) {
    avatar = String(event.userInfo.avatarUrl)
  }

  if (!author) author = '家长'
  if (!avatar) avatar = DEFAULT_AVATAR

  try {
    const result = await db.collection('posts').add({
      data: {
        _openid: OPENID,
        openid: OPENID,
        content,
        images: event.images || [],
        category: event.category || '',
        author,
        avatar,
        createTime: db.serverDate(),
        likes: 0,
        comments: 0,
        status: 'published'
      }
    })

    return { success: true, _id: result._id }
  } catch (err) {
    console.error(err)
    return { success: false, errMsg: err.message }
  }
}
