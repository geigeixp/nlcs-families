// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { secret, checkOnly } = event

  try {
    // 1. 始终先检查数据库中是否已存在该管理员
    const checkRes = await db.collection('admins').where({
      openid: wxContext.OPENID
    }).get()
    
    const isAdmin = checkRes.data.length > 0

    // 如果只是检查权限（checkOnly=true），或者已经是管理员，直接返回结果
    if (checkOnly || isAdmin) {
        if (isAdmin) {
            return { success: true, message: '身份验证通过' }
        } else {
            return { success: false, message: '非管理员账号' }
        }
    }

    // 2. 如果不是管理员
    // 现在的逻辑是：只有在数据库里有记录的才是管理员。
    // 为了安全，我们彻底移除硬编码后门。
    // 如果需要添加管理员，必须通过数据库操作手动添加第一位管理员。
    
    return {
      success: false,
      message: '仅限授权管理员访问'
    }

  } catch (err) {
    console.error(err)
    return {
      success: false,
      message: '系统错误，请稍后重试'
    }
  }
}
