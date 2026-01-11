const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { avatar, englishName, chineseName, currentClass, admissionYear, entryGradeAtEntry, siblings } = event

  try {
    const userRes = await db.collection('applications').where({
      openid: OPENID
    }).get()

    if (userRes.data.length === 0) {
      return { ok: false, error: 'User not found' }
    }

    const docId = userRes.data[0]._id

    const updateData = {}
    if (avatar !== undefined) updateData['student.avatar'] = avatar
    if (englishName !== undefined) updateData['student.englishName'] = englishName
    if (chineseName !== undefined) updateData['student.chineseName'] = chineseName
    if (currentClass !== undefined) updateData['student.currentClass'] = currentClass
    if (admissionYear !== undefined) updateData['student.admissionYear'] = admissionYear
    if (entryGradeAtEntry !== undefined) updateData['student.entryGradeAtEntry'] = entryGradeAtEntry
    
    // Update siblings array if provided
    if (Array.isArray(siblings)) {
      updateData['siblings'] = siblings
    }

    updateData['student.updatedAt'] = Date.now()

    await db.collection('applications').doc(docId).update({
      data: updateData
    })

    return { ok: true }
  } catch (err) {
    console.error(err)
    return { ok: false, error: err.message }
  }
}
