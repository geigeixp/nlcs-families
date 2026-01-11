const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { action, openid } = event
  const { OPENID } = cloud.getWXContext()

  // 1. 权限检查：只有现有的管理员才能执行此操作
  // (初始化时如果没有任何管理员，可能需要临时手动在数据库添加第一条记录)
  const callerRes = await db.collection('admins').where({
    openid: OPENID
  }).get()

  if (callerRes.data.length === 0) {
    return { ok: false, message: 'Permission denied' }
  }

  if (!openid) return { ok: false, message: 'Missing openid' }

  try {
    if (action === 'add') {
      const exist = await db.collection('admins').where({ openid }).get()
      if (exist.data.length > 0) return { ok: true, message: 'Already admin' }
      
      await db.collection('admins').add({
        data: {
          openid,
          createTime: Date.now(),
          createdBy: OPENID
        }
      })
      return { ok: true, message: 'Admin added' }
    } 
    else if (action === 'remove') {
      await db.collection('admins').where({ openid }).remove()
      return { ok: true, message: 'Admin removed' }
    }
    else if (action === 'list') {
      // 获取所有管理员列表
      const res = await db.collection('admins').get()
      return { ok: true, admins: res.data.map(item => item.openid) }
    }
    
    return { ok: false, message: 'Invalid action' }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}