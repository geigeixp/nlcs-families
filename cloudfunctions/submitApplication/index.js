const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function requireString(v) {
  return typeof v === 'string' && v.trim().length > 0
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const db = cloud.database()

  try {
    const admissionYear = String(event.admissionYear || '').trim()
    const entryGradeAtEntry = String(event.entryGradeAtEntry || '').trim()
    const englishName = String(event.englishName || '').trim()
    const chineseName = String(event.chineseName || '').trim()
    const relation = String(event.relation || '').trim()
    const relationOther = String(event.relationOther || '').trim()
    const letterFileId = String(event.letterFileId || '').trim()
    const invite = String(event.invite || '').trim()
  
    if (!requireString(admissionYear)) return { ok: false, message: 'missing_admissionYear' }
    if (!requireString(entryGradeAtEntry)) return { ok: false, message: 'missing_entryGradeAtEntry' }
    if (!requireString(englishName)) return { ok: false, message: 'missing_englishName' }
    if (!requireString(relation)) return { ok: false, message: 'missing_relation' }
    if (relation === '其他' && !requireString(relationOther)) return { ok: false, message: 'missing_relationOther' }
    if (!requireString(letterFileId)) return { ok: false, message: 'missing_letterFileId' }
  
    const now = Date.now()
    const existing = await db.collection('applications').where({
      openid: OPENID
    }).get().catch(() => ({ data: [] }))
    
    const isUpdate = existing.data && existing.data.length > 0
    const oldData = isUpdate ? existing.data[0] : {}
    const createdAt = oldData.createdAt ? oldData.createdAt : now
  
    const application = {
      openid: OPENID,
      status: 'pending',
      invite,
      submittedAt: now,
      createdAt,
      reviewedAt: 0,
      reviewNote: '',
      student: {
        admissionYear,
        entryGradeAtEntry,
        englishName,
        chineseName,
        relation,
        relationOther
      },
      letterFileId
    }
  
    if (isUpdate) {
      await db.collection('applications').doc(oldData._id).update({ data: application })
    } else {
      application._id = OPENID // 尝试指定 ID
      try {
        await db.collection('applications').add({ data: application })
      } catch (e) {
        // 如果指定 _id 失败（可能重复），则不指定 _id 再试一次
        delete application._id
        await db.collection('applications').add({ data: application })
      }
    }

    return { ok: true, application }
  } catch (err) {
    console.error(err)
    return {
      ok: false,
      message: 'Server Error: ' + err.message,
      stack: err.stack
    }
  }
}

