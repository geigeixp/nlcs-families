const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  const db = cloud.database()
  try {
    const res = await db.collection('applications').where({ openid: OPENID }).limit(1).get()
    return { application: (res.data && res.data.length) ? res.data[0] : null }
  } catch (err) {
    console.error(err)
    return { application: null, error: err }
  }
}
