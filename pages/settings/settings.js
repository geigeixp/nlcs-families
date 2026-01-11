const app = getApp()

Page({
  data: {
    avatarUrl: '',
    phone: '',
    email: '',
    address: '',
    loading: false
  },

  onLoad() {
    this.loadProfile()
  },

  loadProfile() {
    const application = wx.getStorageSync('nlcs_application')
    if (application && application.profile) {
      this.setData({
        avatarUrl: application.profile.avatarUrl || '',
        phone: application.profile.phone || '',
        email: application.profile.email || '',
        address: application.profile.address || ''
      })
    }
    // 如果没有自定义头像，显示默认头像或微信头像
    if (!this.data.avatarUrl && application && application.student) {
        // 保持空，或者设置默认值
    }
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    this.setData({ avatarUrl })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({
      [field]: e.detail.value
    })
  },

  // 辅助函数：带重试的上传
  async uploadWithRetry(cloudPath, filePath, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await wx.cloud.uploadFile({
          cloudPath,
          filePath
        })
      } catch (err) {
        console.warn(`Upload attempt ${i + 1} failed:`, err)
        const errMsg = String(err.message || err.errMsg || '')
        const isNetworkError = errMsg.includes('UserNetworkTooSlow') || 
                               errMsg.includes('timeout') || 
                               errMsg.includes('network')
        
        if (i === retries - 1 || !isNetworkError) throw err
        
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }
  },

  async save() {
    this.setData({ loading: true })

    try {
      let fileID = this.data.avatarUrl

      // 如果是临时文件（以 http 开头且不是云存储 ID），则上传
      if (fileID && !fileID.startsWith('cloud://') && (fileID.startsWith('http') || fileID.startsWith('wxfile'))) {
        const uploadRes = await this.uploadWithRetry(
          `avatars/${Date.now()}-${Math.floor(Math.random()*1000)}.jpg`,
          fileID
        )
        fileID = uploadRes.fileID
      }

      const profile = {
        avatarUrl: fileID,
        phone: this.data.phone,
        email: this.data.email,
        address: this.data.address
      }

      // 调用云函数更新
      const res = await wx.cloud.callFunction({
        name: 'updateProfile',
        data: profile
      })

      if (res.result && res.result.ok) {
        // 更新本地缓存
        const appData = wx.getStorageSync('nlcs_application')
        appData.profile = profile
        wx.setStorageSync('nlcs_application', appData)
        
        wx.showToast({ title: '保存成功' })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        throw new Error(res.result.error || '保存失败')
      }

    } catch (err) {
      console.error(err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  }
})
