const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { avatarUrl, phone, email, address } = event

  try {
    // 1. 先查找文档 ID
    const userRes = await db.collection('applications').where({
      openid: OPENID
    }).get()

    if (userRes.data.length === 0) {
      return { ok: false, error: 'User not found' }
    }

    const docId = userRes.data[0]._id

    // 2. 更新数据
    await db.collection('applications').doc(docId).update({
      data: {
        profile: {
          avatarUrl,
          phone,
          email,
          address,
          updatedAt: Date.now()
        }
      }
    })

    return { ok: true }
  } catch (err) {
    console.error(err)
    return { ok: false, error: err.message }
  }
}
