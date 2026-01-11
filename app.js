// app.js
App({
  onLaunch(options) {
    if (wx.cloud) {
      wx.cloud.init({
        env: wx.cloud.DYNAMIC_CURRENT_ENV,
        traceUser: true
      })
    }

    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 登录
    wx.login({
      success: res => {
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
      }
    })

    const existingRole = wx.getStorageSync('nlcs_user_role')
    if (!existingRole) {
      wx.setStorageSync('nlcs_user_role', 'user')
    }

    const invite = (options && options.query && options.query.invite) ? options.query.invite : ''
    if (invite) {
      wx.setStorageSync('nlcs_invite', invite)
    }

    this.refreshSession()
  },
  refreshSession() {
    if (!wx.cloud) {
      return Promise.resolve({
        role: wx.getStorageSync('nlcs_user_role') || 'user',
        openid: wx.getStorageSync('nlcs_openid') || ''
      })
    }

    return Promise.all([
      wx.cloud.callFunction({ name: 'getMyRole' }),
      wx.cloud.callFunction({ name: 'getMyApplication' })
    ])
      .then(([roleRes, appRes]) => {
        const roleData = roleRes && roleRes.result ? roleRes.result : {}
        const appData = appRes && appRes.result ? appRes.result : {}
        if (roleData.openid) {
          wx.setStorageSync('nlcs_openid', roleData.openid)
        }
        if (roleData.role) {
          wx.setStorageSync('nlcs_user_role', roleData.role)
        }
        if (appData.application) {
          wx.setStorageSync('nlcs_application', appData.application)
        }
        
        // 更新全局用户信息
        const application = appData.application || wx.getStorageSync('nlcs_application')
        if (application && application.student) {
          let nickName = application.student.englishName || '家长'
          if (application.student.chineseName) {
            nickName += ` (${application.student.chineseName})`
          }
          this.globalData.userInfo = {
            nickName: nickName,
            avatarUrl: (application.profile && application.profile.avatarUrl) || 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwBHJrFd5vfcptsJIS2eD9nlJ5ca8K78R8Uf8rD2QkR6v2j9b2q0a2a0a2a0a2a0a2a0a2a0a2a/0'
          }
        }

        return {
          role: roleData.role || 'user',
          openid: roleData.openid || '',
          application: appData.application || null
        }
      })
      .catch(() => {
        return {
          role: wx.getStorageSync('nlcs_user_role') || 'user',
          openid: wx.getStorageSync('nlcs_openid') || '',
          application: wx.getStorageSync('nlcs_application') || null
        }
      })
  },
  refreshUnread() {
    if (!wx.cloud) return Promise.resolve({ ok: false })

    const since = Number(wx.getStorageSync('nlcs_last_seen_interactions') || 0) || 0
    return wx.cloud.callFunction({
      name: 'getMyUnread',
      data: { since }
    }).then(res => {
      const r = res && res.result ? res.result : {}
      if (r.ok && r.hasUnread) {
        wx.showTabBarRedDot({ index: 3 }).catch(() => {})
      } else {
        wx.hideTabBarRedDot({ index: 3 }).catch(() => {})
      }
      return r
    }).catch(() => ({ ok: false }))
  },
  markInteractionsSeen() {
    wx.setStorageSync('nlcs_last_seen_interactions', Date.now())
    wx.hideTabBarRedDot({ index: 3 }).catch(() => {})
  },
  globalData: {
    userInfo: null,
    // 模拟一些初始数据，避免空空如也
    mockPosts: [
      {
        id: 1,
        author: "张子涵妈妈",
        avatar: "https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwBHdR33U7XkX7c9Xj7Z1i4h7hX7kX7c9Xj7Z1i4h7hX7kX7c9Xj7Z1i4h7/0",
        content: "今天学校的运动会真精彩！孩子们都好棒！🏃‍♂️🏃‍♀️",
        time: "10分钟前",
        likes: 12,
        comments: 3,
        images: ["https://picsum.photos/200/200"]
      },
      {
        id: 2,
        author: "李明爸爸",
        avatar: "https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwBHdR33U7XkX7c9Xj7Z1i4h7hX7kX7c9Xj7Z1i4h7hX7kX7c9Xj7Z1i4h7/0",
        content: "请问大家，这周末的科学讲座是在大礼堂还是图书馆？",
        time: "1小时前",
        likes: 5,
        comments: 8,
        images: []
      },
       {
        id: 3,
        author: "学校教务处",
        avatar: "https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwBHdR33U7XkX7c9Xj7Z1i4h7hX7kX7c9Xj7Z1i4h7hX7kX7c9Xj7Z1i4h7/0",
        content: "【通知】下周一（10月15日）将进行全校范围的各种安全演练，请各位家长知悉。",
        time: "2小时前",
        likes: 45,
        comments: 0,
        images: []
      }
    ]
  }
})
