const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  const db = cloud.database()
  const adminRes = await db.collection('admins').where({ openid: OPENID }).limit(1).get()
  const role = adminRes.data && adminRes.data.length > 0 ? 'admin' : 'user'
  return { openid: OPENID, role }
}

