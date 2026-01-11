const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  try {
    // Try to update in applications first
    const appRes = await db.collection('applications').where({
      openid: OPENID
    }).limit(1).get()

    if (appRes.data.length > 0) {
      await db.collection('applications').where({
        openid: OPENID
      }).update({
        data: {
          msgLastClearedTime: db.serverDate()
        }
      })
    } else {
      // If no application, try users collection
      const userRes = await db.collection('users').where({
        _openid: OPENID
      }).limit(1).get()
      
      if (userRes.data.length > 0) {
         await db.collection('users').where({
          _openid: OPENID
        }).update({
          data: {
            msgLastClearedTime: db.serverDate()
          }
        })
      } else {
        // Just create a placeholder in users? Or ignore.
        // For now, assume most users have an application record.
      }
    }
    return { success: true }
  } catch (e) {
    console.error(e)
    return { success: false, message: e.message }
  }
}