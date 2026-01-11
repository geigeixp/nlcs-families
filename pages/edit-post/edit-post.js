const app = getApp()

Page({
  data: {
    approved: false,
    postId: '',
    content: '',
    images: [],
    categories: ['闲置转让', '活动召集', '互助问答', '失物招领', '学习交流', '生活分享'],
    selectedCategoryIndex: -1,
    saving: false
  },

  onLoad(options) {
    const postId = String((options && options.id) || '').trim()
    this.setData({ postId })
  },

  onShow() {
    app.refreshSession().finally(() => {
      const ok = this.checkApprovedStatus()
      this.setData({ approved: ok })
      if (ok && this.data.postId) {
        this.loadPost()
      }
    })
  },

  checkApprovedStatus() {
    const application = wx.getStorageSync('nlcs_application')
    return application && application.status === 'approved'
  },

  goStatus() {
    wx.navigateTo({ url: '/pages/status/status' })
  },

  loadPost() {
    wx.showLoading({ title: '加载中...' })
    wx.cloud.callFunction({
      name: 'getPostForEdit',
      data: { postId: this.data.postId }
    }).then(res => {
      const r = res && res.result ? res.result : {}
      if (!r.ok) {
        wx.showToast({ title: '无法加载帖子', icon: 'none' })
        return
      }
      const p = r.data || {}
      const category = String(p.category || '')
      const idx = this.data.categories.indexOf(category)
      this.setData({
        content: String(p.content || ''),
        images: Array.isArray(p.images) ? p.images : [],
        selectedCategoryIndex: idx >= 0 ? idx : -1
      })
    }).catch(err => {
      console.error(err)
      wx.showToast({ title: '无法加载帖子', icon: 'none' })
    }).finally(() => {
      wx.hideLoading()
    })
  },

  onInput(e) {
    this.setData({ content: e.detail.value })
  },

  selectCategory(e) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({
      selectedCategoryIndex: this.data.selectedCategoryIndex === index ? -1 : index
    })
  },

  previewImage(e) {
    const current = e.currentTarget.dataset.src
    wx.previewImage({
      current,
      urls: this.data.images
    })
  },

  submitUpdate() {
    if (!this.data.approved) return
    if (this.data.saving) return

    const content = String(this.data.content || '').trim()
    const category = this.data.selectedCategoryIndex !== -1 ? this.data.categories[this.data.selectedCategoryIndex] : ''

    if (!content && (!this.data.images || !this.data.images.length)) {
      wx.showToast({ title: '请输入内容', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...' })
    wx.cloud.callFunction({
      name: 'updatePost',
      data: {
        postId: this.data.postId,
        content,
        category
      }
    }).then(res => {
      const r = res && res.result ? res.result : {}
      if (!r.ok) {
        wx.showToast({ title: r.message ? `保存失败(${r.message})` : '保存失败', icon: 'none' })
        return
      }
      wx.showToast({ title: '已保存' })
      wx.navigateBack().catch(() => {})
    }).catch(err => {
      console.error(err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }).finally(() => {
      wx.hideLoading()
      this.setData({ saving: false })
    })
  }
})
