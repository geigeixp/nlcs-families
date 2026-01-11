const app = getApp()

Page({
  data: {
    messages: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    isLoading: false
  },

  onShow() {
    // 每次进入页面刷新，并标记已读
    this.refreshMessages()
    this.markAsRead()
  },

  onUnload() {
    this.markAsRead()
  },
  
  onHide() {
    this.markAsRead()
  },

  markAsRead() {
    // 简单实现：记录当前时间为"最后查看时间"
    // 下次计算未读时，只计算这个时间之后的
    wx.setStorageSync('nlcs_last_seen_interactions', Date.now())
    app.markInteractionsSeen && app.markInteractionsSeen()
  },

  refreshMessages() {
    this.setData({ page: 1, hasMore: true })
    this.loadMessages(true)
  },

  loadMessages(reset = false) {
    if (this.data.isLoading) return
    if (!this.data.hasMore && !reset) return

    this.setData({ isLoading: true })
    
    wx.cloud.callFunction({
      name: 'getMessages',
      data: {
        page: this.data.page,
        pageSize: this.data.pageSize
      }
    }).then(res => {
      this.setData({ isLoading: false })
      if (res.result && res.result.ok) {
        const list = res.result.list.map(item => ({
          ...item,
          timeStr: this.formatTime(item.createdAt)
        }))
        
        // Update last seen time to the latest message time to handle clock skew
        let maxTime = Date.now()
        list.forEach(item => {
          const t = new Date(item.createdAt).getTime()
          if (t > maxTime) maxTime = t
        })
        // Add a small buffer (1s) to ensure we cover the latest message
        wx.setStorageSync('nlcs_last_seen_interactions', maxTime + 1000)
        app.markInteractionsSeen && app.markInteractionsSeen()

        this.setData({
          messages: reset ? list : [...this.data.messages, ...list],
          page: this.data.page + 1,
          hasMore: res.result.hasMore
        })
      }
    }).catch(err => {
      console.error(err)
      this.setData({ isLoading: false })
    })
  },

  onPullDownRefresh() {
    this.refreshMessages()
    this.markAsRead()
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    this.loadMessages(false)
  },

  goPost(e) {
    const postId = e.currentTarget.dataset.id
    if (!postId) return
    wx.navigateTo({
      url: `/pages/post/post?id=${postId}`
    })
  },

  onClearAll() {
    wx.showModal({
      title: '提示',
      content: '确定要清除所有消息吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '清除中' })
          wx.cloud.callFunction({
            name: 'clearMessages'
          }).then(res => {
            wx.hideLoading()
            if (res.result && res.result.success) {
              this.setData({ messages: [], page: 1, hasMore: false })
              this.markAsRead() // Update local read status too
              wx.showToast({ title: '已清除' })
            } else {
              wx.showToast({ title: '清除失败', icon: 'none' })
            }
          }).catch(err => {
            wx.hideLoading()
            console.error(err)
            wx.showToast({ title: '清除失败', icon: 'none' })
          })
        }
      }
    })
  },

  formatTime(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date
    
    // 1分钟内
    if (diff < 60 * 1000) return '刚刚'
    // 1小时内
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`
    // 24小时内
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}小时前`
    // 超过24小时显示日期
    const y = date.getFullYear()
    const m = date.getMonth() + 1
    const d = date.getDate()
    return `${y}/${m}/${d}`
  }
})
