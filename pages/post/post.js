const app = getApp()

Page({
  data: {
    content: '',
    images: [],
    categories: ['闲置转让', '活动召集', '互助问答', '失物招领', '学习交流', '生活分享'],
    selectedCategoryIndex: -1,
    approved: false
  },

  onShow() {
    app.refreshSession().finally(() => {
      const ok = this.checkApprovedStatus()
      this.setData({
        approved: ok
      })
      app.refreshUnread()
    })
  },

  checkApprovedStatus() {
    const application = wx.getStorageSync('nlcs_application')
    return application && application.status === 'approved'
  },

  ensureApproved() {
    if (this.checkApprovedStatus()) {
      return true
    }

    wx.showModal({
      title: '提示',
      content: '请先完成家长认证审核才能发帖',
      confirmText: '去认证',
      success: res => {
        if (res.confirm) {
          wx.navigateTo({
            url: '/pages/status/status'
          })
        }
      }
    })
    return false
  },

  goStatus() {
    wx.navigateTo({
      url: '/pages/status/status'
    })
  },

  onInput(e) {
    this.setData({
      content: e.detail.value
    })
  },

  selectCategory(e) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({
      selectedCategoryIndex: this.data.selectedCategoryIndex === index ? -1 : index
    })
  },

  chooseImage() {
    if (!this.ensureApproved()) {
      return
    }
    wx.chooseImage({
      count: 9 - this.data.images.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({
          images: this.data.images.concat(res.tempFilePaths)
        })
      }
    })
  },

  previewImage(e) {
    const current = e.currentTarget.dataset.src;
    wx.previewImage({
      current: current,
      urls: this.data.images
    })
  },

  removeImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images;
    images.splice(index, 1);
    this.setData({
      images: images
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

  submitPost() {
    if (!this.ensureApproved()) {
      return
    }
    const { content, images } = this.data;
    
    if (!content && images.length === 0) {
      wx.showToast({ title: '请输入内容或上传图片', icon: 'none' })
      return;
    }

    wx.showLoading({
      title: '发布中...',
    })

    const category = this.data.selectedCategoryIndex !== -1 
      ? this.data.categories[this.data.selectedCategoryIndex] 
      : ''
    
    // 1. 上传图片到云存储 (带重试)
    const uploadTasks = images.map(filePath => {
      const cloudPath = `posts/${Date.now()}_${Math.random().toString(16).slice(2)}.jpg`
      return this.uploadWithRetry(cloudPath, filePath).then(res => res.fileID)
    })

    Promise.all(uploadTasks).then(fileIDs => {
      const globalUserInfo = app.globalData.userInfo || {}
      const application = wx.getStorageSync('nlcs_application')

      let nickName = globalUserInfo.nickName
      let avatarUrl = globalUserInfo.avatarUrl

      if (!nickName && application && application.student) {
        nickName = application.student.englishName || '家长'
        if (application.student.chineseName) {
          nickName += ` (${application.student.chineseName})`
        }
        const relationRaw = String(application.student.relation || '').trim()
        const relation = relationRaw === '其他' ? String(application.student.relationOther || '').trim() : relationRaw
        const relationText = relation === '父亲' ? '爸爸' : (relation === '母亲' ? '妈妈' : relation)
        if (relationText) {
          nickName += ` ${relationText}`
        }
      }

      if (!avatarUrl && application && application.profile && application.profile.avatarUrl) {
        avatarUrl = application.profile.avatarUrl
      }

      return wx.cloud.callFunction({
        name: 'createPost',
        data: {
          content,
          images: fileIDs,
          category,
          userInfo: {
            nickName,
            avatarUrl
          }
        }
      })
    }).then(res => {
      wx.hideLoading()
      if (res.result.success) {
        wx.showToast({
          title: '发布成功',
          icon: 'success'
        })
        
        // 清空输入
        this.setData({
          content: '',
          images: [],
          selectedCategoryIndex: -1
        });

        // 返回首页并刷新
        wx.switchTab({
          url: '/pages/index/index'
        })
      } else {
        wx.showToast({
          title: res.result.message || '发布失败',
          icon: 'none'
        })
      }
    }).catch(err => {
      wx.hideLoading()
      console.error(err)
      wx.showToast({
        title: '发布失败',
        icon: 'none'
      })
    })
  }
})
