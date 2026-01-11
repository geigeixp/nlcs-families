const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function buildChildName(student) {
  if (!student) return ''
  const englishName = String(student.englishName || '').trim()
  const chineseName = String(student.chineseName || '').trim()
  // Use English name, fallback to Chinese name
  let name = englishName || chineseName || ''
  return name
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const targetOpenid = String(event.targetOpenid || event.openid || '').trim()

  if (!targetOpenid) return { ok: false, message: 'missing_openid' }

  try {
    const myRes = await db.collection('applications').where({ openid: OPENID }).limit(1).get()
    const myApp = (myRes.data && myRes.data.length) ? myRes.data[0] : null
    if (!myApp || myApp.status !== 'approved') {
      return { ok: false, message: 'forbidden' }
    }

    const res = await db.collection('applications').where({ openid: targetOpenid }).limit(1).get()
    const application = (res.data && res.data.length) ? res.data[0] : null
    if (!application) return { ok: false, message: 'not_found' }

    const student = application.student || {}
    const profile = application.profile || {}
    const siblings = Array.isArray(application.siblings) ? application.siblings : []

    // 1. Child Name
    let childName = buildChildName(student)
    if (siblings.length > 0) {
      const siblingNames = siblings.map(s => buildChildName(s)).filter(n => n)
      if (siblingNames.length > 0) {
        childName = childName ? `${childName} & ${siblingNames.join(' & ')}` : siblingNames.join(' & ')
      }
    }

    // 2. Admission Year
    const years = []
    if (student.admissionYear) years.push(student.admissionYear)
    siblings.forEach(s => { if (s.admissionYear) years.push(s.admissionYear) })
    const admissionYear = years.join(' & ')

    // 3. Entry Grade
    const grades = []
    if (student.entryGradeAtEntry) grades.push(student.entryGradeAtEntry)
    siblings.forEach(s => { if (s.entryGradeAtEntry) grades.push(s.entryGradeAtEntry) })
    const entryGradeAtEntry = grades.join(' & ')

    // 4. Current Class
    const classes = []
    if (student.currentClass) classes.push(student.currentClass)
    siblings.forEach(s => { if (s.currentClass) classes.push(s.currentClass) })
    const currentClass = classes.join(' & ')

    const phone = String(profile.phone || '').trim()
    const email = String(profile.email || '').trim()
    const address = String(profile.address || '').trim()
    const BROKEN_URLS = [
      'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwBHdR33U7XkX7c9Xj7Z1i4h7hX7kX7c9Xj7Z1i4h7hX7kX7c9Xj7Z1i4h7/0',
      'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwBHJrFd5vfcptsJIS2eD9nlJ5ca8K78R8Uf8rD2QkR6v2j9b2q0a2a0a2a0a2a0a2a0a2a0a2a/0'
    ]
    let avatar = String(profile.avatarUrl || '').trim()
    if (BROKEN_URLS.includes(avatar)) avatar = '/images/default-avatar.png'

    const data = {
      childName: childName || '',
      admissionYear: admissionYear || '',
      entryGradeAtEntry: entryGradeAtEntry || '',
      currentClass: currentClass || '',
      phone: phone || '',
      email: email || '',
      address: address || '',
      avatar: avatar || ''
    }

    return { ok: true, data }
  } catch (err) {
    console.error(err)
    return { ok: false, message: err.message }
  }
}