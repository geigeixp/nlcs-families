const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// Map old Chinese grades to new English grades
const GRADE_MAP = {
  '幼儿园': 'KG1', // Default mapping
  '一年级': 'G1',
  '二年级': 'G2',
  '三年级': 'G3',
  '四年级': 'G4',
  '五年级': 'G5',
  '六年级': 'G6',
  '七年级': 'G7',
  '八年级': 'G8',
  '九年级': 'G9',
  '十年级': 'G10',
  '十一年级': 'G11',
  '十二年级': 'G12'
}

const NEW_GRADES = ['Pre-KG', 'KG1', 'KG2', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12']

exports.main = async (event, context) => {
  // Only admin can trigger this
  const { OPENID } = cloud.getWXContext()
  
  // Check if caller is admin
  const adminRes = await db.collection('admins').where({
    openid: OPENID
  }).get()

  if (adminRes.data.length === 0) {
    return { ok: false, error: 'Permission denied' }
  }

  try {
    // Get all applications that have student info
    const batchSize = 100
    const countRes = await db.collection('applications').count()
    const total = countRes.total
    
    let updatedCount = 0
    let failedCount = 0
    
    for (let i = 0; i < total; i += batchSize) {
      const list = await db.collection('applications')
        .skip(i)
        .limit(batchSize)
        .get()
        
      const tasks = list.data.map(async (doc) => {
        if (!doc.student || !doc.student.entryGradeAtEntry) return
        
        const oldGrade = doc.student.entryGradeAtEntry
        let newGrade = oldGrade
        
        // If it's in the map, convert it
        if (GRADE_MAP[oldGrade]) {
          newGrade = GRADE_MAP[oldGrade]
        }
        
        // If it's not in new grades list and not in map, maybe clear it? 
        // Or keep it? Let's keep it but user can fix it.
        
        if (newGrade !== oldGrade) {
          try {
            await db.collection('applications').doc(doc._id).update({
              data: {
                'student.entryGradeAtEntry': newGrade
              }
            })
            return 1
          } catch (e) {
            console.error('Update failed for', doc._id, e)
            return 0
          }
        }
        return 0
      })
      
      const results = await Promise.all(tasks)
      updatedCount += results.reduce((a, b) => a + b, 0)
    }

    return { 
      ok: true, 
      total, 
      updatedCount,
      message: `Successfully migrated ${updatedCount} users.`
    }
  } catch (err) {
    console.error(err)
    return { ok: false, error: err.message }
  }
}
