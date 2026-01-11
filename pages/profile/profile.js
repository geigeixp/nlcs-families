const app = getApp()

Page({
  data: {
    userInfo: {},
    hasUserInfo: false,
    role: 'user',
    status: 'none',
    statusText: '未申请',
    openid: '',
    hasUnread: false,
    displayName: '家长',
    displayDesc: '未认证',
    avatarUrl: '/images/default-avatar.png',
    pendingCount: 0
  },
  
  onLoad() {
    app.refreshSession().finally(() => {
      this.refresh()
    })
  },

  onShow() {
    app.refreshSession().finally(() => {
      this.refresh()
      app.refreshUnread().then(res => {
        // app.refreshUnread already returns the result object (unwrapped)
        const r = res || {}
        if (r.ok) {
          this.setData({
            hasUnread: r.hasUnread,
            hasUnreadMessages: r.hasUnreadMessages || false,
            pendingCount: (r.pendingCount !== undefined) ? r.pendingCount : this.data.pendingCount
          })
        }
      })
    })
  },

  /* checkPendingCount removed as it is merged into getMyUnread */

  refresh() {
    const role = wx.getStorageSync('nlcs_user_role') || 'user'
    const application = wx.getStorageSync('nlcs_application')
    const status = application && application.status ? application.status : 'none'
    const openid = wx.getStorageSync('nlcs_openid') || ''
    
    // 计算显示信息
    let displayName = '家长'
    let displayDesc = '未认证'
    let avatarUrl = this.data.avatarUrl // 默认头像
    
    // New fields for display enhancement
    let childNameRelation = '家长'
    let currentClass = ''

    if (application && application.student) {
      let childName = application.student.englishName || application.student.chineseName || ''
      
      // Handle siblings for Name
      if (Array.isArray(application.siblings) && application.siblings.length > 0) {
        const siblingNames = application.siblings.map(s => {
          return s.englishName || s.chineseName || ''
        }).filter(n => n)
        
        if (siblingNames.length > 0) {
          childName = childName ? `${childName} & ${siblingNames.join(' & ')}` : siblingNames.join(' & ')
        }
      }

      const relation = application.student.relation || ''
      const relationOther = application.student.relationOther || ''
      const finalRelation = relation === '其他' ? relationOther : relation
      
      if (childName) {
        childNameRelation = finalRelation ? `${childName} ${finalRelation}` : childName
      } else {
        childNameRelation = finalRelation || '家长'
      }

      // Handle Class
      const classes = []
      if (application.student.currentClass) {
        classes.push(application.student.currentClass)
      }
      
      // Handle siblings for Class
      if (Array.isArray(application.siblings) && application.siblings.length > 0) {
        application.siblings.forEach(s => {
          if (s.currentClass) {
            classes.push(s.currentClass)
          }
        })
      }
      
      if (classes.length > 0) {
        currentClass = classes.join(' & ')
      }

      // Fallback for displayDesc (old logic, just in case)
      displayName = childName || '家长'
      const grade = application.student.entryGradeAtEntry || ''
      if (grade || finalRelation) {
        displayDesc = `${grade} ${finalRelation}`.trim()
      }
    }

    // 如果有自定义设置的头像（存储在 application.profile 中）
    let contactInfo = null
    if (application && application.profile) {
      if (application.profile.avatarUrl) {
        avatarUrl = application.profile.avatarUrl
      }
      contactInfo = {
        phone: application.profile.phone,
        email: application.profile.email,
        address: application.profile.address
      }
    }

    const map = {
      approved: '已通过',
      pending: '审核中',
      rejected: '未通过',
      none: '未申请'
    }
    
    this.setData({
      role,
      status,
      statusText: map[status] || '未申请',
      openid,
      displayName,
      displayDesc,
      childNameRelation,
      currentClass,
      avatarUrl,
      contactInfo
    })
  },

  goMessages() {
    wx.navigateTo({
      url: '/pages/messages/messages'
    })
  },

  goChildInfo() {
    if (this.data.status !== 'approved') {
      wx.showToast({ title: '请先通过审核', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: '/pages/child-info/child-info'
    })
  },

  goSettings() {
    if (this.data.status !== 'approved') {
      wx.showToast({ title: '请先通过审核', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: '/pages/settings/settings'
    })
  },

  goStatus() {
    wx.navigateTo({
      url: '/pages/status/status'
    })
  },

  goRegister() {
    wx.navigateTo({
      url: '/pages/register/register'
    })
  },

  goAdmin() {
    wx.navigateTo({
      url: '/pages/admin/admin'
    })
  },

  goMyPosts() {
    if (this.data.status !== 'approved') {
      wx.showToast({ title: '请先通过审核', icon: 'none' })
      return
    }
    app.markInteractionsSeen()
    wx.navigateTo({
      url: '/pages/my-posts/my-posts'
    })
  },

  onAdminCodeInput(e) {
    this.setData({
      adminCode: e.detail.value
    })
  },

  switchToAdmin() {
    // 移除硬编码口令验证，直接检查用户是否在管理员数据库中
    wx.showLoading({ title: '验证中...' })

    wx.cloud.callFunction({
      name: 'registerAsAdmin',
      data: {
        // 不再传递 secret，仅依靠 registerAsAdmin 内部去查库
        checkOnly: true 
      }
    }).then(res => {
      wx.hideLoading()
      if (res.result.success) {
        wx.showToast({
          title: '切换成功',
          icon: 'success'
        })
        // 刷新会话状态
        app.refreshSession().then(() => {
          this.refresh()
          this.setData({ adminCode: '' }) // 清空输入框
        })
      } else {
        wx.showModal({
            title: '无管理员权限',
            content: '您的账号未被授权为管理员。请联系现有管理员添加您的权限。',
            showCancel: false
        })
      }
    }).catch(err => {
      wx.hideLoading()
      console.error('云函数调用失败：', err)
      wx.showToast({
        title: '错误: ' + (err.message || err.errMsg || '未知错误'),
        icon: 'none',
        duration: 3000
      })
    })
  },

  exitAdmin() {
    // 退出管理员并不需要删数据库，只是本地切回 user 视角（如果需要彻底移除权限，得写 removeAdmin 接口）
    // 这里为了演示方便，我们暂时只清本地缓存，或者你可以选择不做任何事，
    // 因为"管理员"身份是永久的。
    // 如果想要"临时退出"，可以手动设一个本地标记。
    // 但根据通常需求，管理员切换回普通用户视角看效果即可。
    // 这里我们简单地把本地 role 改回 user，但下次刷新又会变回 admin。
    // 如果要真正"辞职"，需要云函数 delete。
    
    // 咱们简单处理：提示用户管理员身份是永久的，或者直接不做这个按钮的逻辑。
    // 为了响应 UI 上的"退出管理员"，我们可以做一个暂时的视图切换。
    
    this.setData({ role: 'user' })
    wx.setStorageSync('nlcs_user_role', 'user')
    wx.showToast({ title: '已切换至用户视角' })
  },

  copyOpenid() {
    if (!this.data.openid) return
    wx.setClipboardData({
      data: this.data.openid
    })
  }
})
