const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const db = cloud.database()
  const _ = db.command
  
  // Filters
  const keyword = String(event.keyword || '').trim().toLowerCase()
  const year = String(event.year || '').trim()
  const grade = String(event.grade || '').trim()
  const cls = String(event.class || '').trim().toLowerCase()
  
  const page = Math.max(1, event.page || 1)
  const pageSize = 20

  // 1. Fetch all approved applications
  // Since we need to filter individual siblings, it's easier to fetch all and filter in memory 
  // unless the dataset is huge. For a school directory, it's likely manageable.
  
  const MAX_LIMIT = 100
  const countResult = await db.collection('applications').where({ status: 'approved' }).count()
  const totalApps = countResult.total
  
  let allApps = []
  // Loop to fetch all
  for (let i = 0; i < totalApps; i += MAX_LIMIT) {
    const res = await db.collection('applications')
      .where({ status: 'approved' })
      .skip(i)
      .limit(MAX_LIMIT)
      .get()
    if (res.data) {
        allApps = allApps.concat(res.data)
    }
  }
  
  // 2. Flatten and Extract Students
  let allStudents = []
  
  for (const app of allApps) {
    // Primary Student
    if (app.student) {
      allStudents.push({
        uniqueId: app._id + '_primary',
        openid: app.openid || app._openid, // Support both if inconsistent
        isPrimary: true,
        ...app.student
      })
    }
    
    // Siblings
    if (Array.isArray(app.siblings)) {
      app.siblings.forEach((sib, idx) => {
        allStudents.push({
          uniqueId: app._id + '_sib_' + idx,
          openid: app.openid || app._openid,
          isPrimary: false,
          ...sib
        })
      })
    }
  }
  
  // 3. Apply Filters
  let filtered = allStudents.filter(s => {
    // Year
    if (year && s.admissionYear !== year) return false
    // Grade
    if (grade && s.entryGradeAtEntry !== grade) return false
    // Class (Partial match)
    if (cls && (!s.currentClass || !s.currentClass.toLowerCase().includes(cls))) return false
    // Keyword (Name search)
    if (keyword) {
      const en = (s.englishName || '').toLowerCase()
      const ch = (s.chineseName || '').toLowerCase()
      if (!en.includes(keyword) && !ch.includes(keyword)) return false
    }
    return true
  })
  
  // 4. Paginate
  const total = filtered.length
  const start = (page - 1) * pageSize
  const pagedStudents = filtered.slice(start, start + pageSize)
  
  // 5. Enhance with Parent Info
  if (pagedStudents.length > 0) {
    const openids = [...new Set(pagedStudents.map(s => s.openid))]
    
    // Fetch users (max 20 openids per page, so one batch query is enough)
    // Note: 'users' collection uses _openid usually
    try {
        const userRes = await db.collection('users').where({
          _openid: _.in(openids)
        }).get()
        
        const usersMap = {}
        if (userRes.data) {
            userRes.data.forEach(u => {
                usersMap[u._openid] = u
            })
        }
        
        pagedStudents.forEach(s => {
          const u = usersMap[s.openid]
          if (u) {
            s.parentNickName = u.nickName
            s.parentAvatarUrl = u.avatarUrl
          }
        })
    } catch (err) {
        console.error('Error fetching parent info:', err)
        // Continue without parent info
    }
  }
  
  return {
    ok: true,
    list: pagedStudents,
    total,
    page,
    totalPages: Math.ceil(total / pageSize)
  }
}