const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

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
  const page = Number(event.page || 1) || 1
  const pageSize = Math.min(Number(event.pageSize || 10) || 10, 20)

  try {
    let author = ''
    let avatar = ''
    const appRes = await db.collection('applications').where({ openid: OPENID }).limit(1).get()
    if (appRes.data && appRes.data.length) {
      const application = appRes.data[0]
      author = buildDisplayName(application.student, application.siblings)
      avatar = (application.profile && application.profile.avatarUrl) ? application.profile.avatarUrl : ''
    }

    const res = await db.collection('posts')
      .where(_.and([
        _.or([
          { openid: OPENID },
          { _openid: OPENID }
        ]),
        { status: 'published' }
      ]))
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()

    let posts = res.data || []
    if (author || avatar) {
      posts = posts.map(p => {
        const next = { ...p }
        if (author) next.author = author
        if (avatar) next.avatar = avatar
        return next
      })
    }
    const fileIDsToResolve = []
    for (const p of posts) {
      if (p && p.avatar) fileIDsToResolve.push(p.avatar)
      if (p && Array.isArray(p.images)) {
        for (const img of p.images) fileIDsToResolve.push(img)
      }
    }
    const urlMap = await getTempUrlMap(fileIDsToResolve)
    posts = posts.map(p => {
      const next = { ...p }
      if (next.avatar && urlMap[next.avatar]) next.avatar = urlMap[next.avatar]
      if (Array.isArray(next.images)) next.images = next.images.map(img => urlMap[img] || img)
      return next
    })

    return { ok: true, data: posts }
  } catch (err) {
    console.error(err)
    return { ok: false, message: err.message }
  }
}
