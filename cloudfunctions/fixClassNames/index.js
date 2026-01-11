const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

function cleanClass(className) {
  if (!className) return className
  // Uppercase
  let val = String(className).toUpperCase()
  // Remove 'G' or 'GRADE' followed by digit
  // e.g. "G7C" -> "7C", "Grade 7C" -> "7C"
  val = val.replace(/^G(?:RADE)?\s*(\d)/, '$1')
  return val
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  
  // Check if caller is admin
  const adminRes = await db.collection('admins').where({
    openid: OPENID
  }).get()

  if (adminRes.data.length === 0) {
    return { ok: false, error: 'Permission denied. Only admins can run this.' }
  }

  try {
    const batchSize = 100
    const countRes = await db.collection('applications').count()
    const total = countRes.total
    
    let updatedCount = 0
    let processedCount = 0
    
    for (let i = 0; i < total; i += batchSize) {
      const list = await db.collection('applications')
        .skip(i)
        .limit(batchSize)
        .get()
        
      const tasks = list.data.map(async (doc) => {
        let needsUpdate = false
        const updateData = {}
        
        // 1. Check student.currentClass
        if (doc.student && doc.student.currentClass) {
          const oldClass = doc.student.currentClass
          const newClass = cleanClass(oldClass)
          if (newClass !== oldClass) {
            updateData['student.currentClass'] = newClass
            needsUpdate = true
          }
        }
        
        // 2. Check siblings
        if (Array.isArray(doc.siblings) && doc.siblings.length > 0) {
          let siblingsChanged = false
          const cleanedSiblings = doc.siblings.map(s => {
            if (s.currentClass) {
              const cleaned = cleanClass(s.currentClass)
              if (cleaned !== s.currentClass) {
                siblingsChanged = true
                return { ...s, currentClass: cleaned }
              }
            }
            return s
          })
          
          if (siblingsChanged) {
            updateData['siblings'] = cleanedSiblings
            needsUpdate = true
          }
        }
        
        if (needsUpdate) {
          try {
            await db.collection('applications').doc(doc._id).update({
              data: updateData
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
      processedCount += list.data.length
    }

    return { 
      ok: true, 
      total, 
      processedCount,
      updatedCount,
      message: `Successfully scanned ${processedCount} users, updated ${updatedCount} users.`
    }
  } catch (err) {
    console.error(err)
    return { ok: false, error: err.message }
  }
}
