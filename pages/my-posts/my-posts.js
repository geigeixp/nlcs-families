const app = getApp()
const { parseTextLinks, normalizeUrl } = require('../../utils/linkify')

Page({
  data: {
    posts: [],
    page: 1,
    hasMore: true,
    isLoading: false,
    showComments: false,
    currentPostId: '',
    commentList: [],
    unreadMap: {}
  },

  onShow() {
    app.refreshSession().finally(() => {
      this._unreadSince = Number(wx.getStorageSync('nlcs_last_seen_interactions') || 0) || 0
      app.markInteractionsSeen()
      this.loadMyPosts(true)
    })
  },

  loadMyPosts(reset = false) {
    if (!wx.cloud) return
    if (this.data.isLoading) return

    if (reset) {
      this.setData({ page: 1, hasMore: true })
    }
    if (!this.data.hasMore && !reset) return

    this.setData({ isLoading: true })
    wx.showLoading({ title: '加载中' })

    wx.cloud.callFunction({
      name: 'getMyPosts',
      data: { page: this.data.page, pageSize: 10 }
    }).then(res => {
      wx.hideLoading()
      this.setData({ isLoading: false })
      if (!res.result || !res.result.ok) return

      const newPosts = (res.result.data || []).map(p => {
        return { ...p, time: this.formatTime(new Date(p.createTime)), contentParts: parseTextLinks(p.content || '') }
      })

      const nextPosts = reset ? newPosts : this.data.posts.concat(newPosts)
      this.setData({
        posts: nextPosts,
        page: this.data.page + 1,
        hasMore: newPosts.length === 10
      })

      if (reset) {
        this.loadUnreadBadges()
        app.markInteractionsSeen()
      }
    }).catch(err => {
      wx.hideLoading()
      this.setData({ isLoading: false })
      console.error(err)
    })
  },

  loadUnreadBadges() {
    const posts = this.data.posts || []
    if (!posts.length) {
      this.setData({ unreadMap: {} })
      return
    }

    const stored = wx.getStorageSync('nlcs_last_seen_interactions_per_post')
    const storedMap = (stored && typeof stored === 'object') ? stored : {}
    const defaultSince = Number(this._unreadSince || 0) || 0
    const perPostSince = {}
    for (const p of posts) {
      const pid = p && p._id ? String(p._id) : ''
      if (!pid) continue
      perPostSince[pid] = Number(storedMap[pid] || defaultSince) || 0
    }

    wx.cloud.callFunction({
      name: 'getMyUnread',
      data: { perPostSince }
    }).then(res => {
      const r = res && res.result ? res.result : {}
      if (!r.ok) return
      this.setData({ unreadMap: r.perPost || {} })
    }).catch(err => {
      console.error(err)
    })
  },

  onReachBottom() {
    this.loadMyPosts(false)
  },

  formatTime(date) {
    const now = new Date()
    const diff = now - date
    const minute = 60 * 1000
    const hour = 60 * minute
    const day = 24 * hour

    if (diff < minute) return '刚刚'
    if (diff < hour) return Math.floor(diff / minute) + '分钟前'
    if (diff < day) return Math.floor(diff / hour) + '小时前'
    if (diff < day * 2) return '昨天'
    const m = date.getMonth() + 1
    const d = date.getDate()
    return `${m}月${d}日`
  },

  previewImage(e) {
    const current = e.currentTarget.dataset.current
    const urls = e.currentTarget.dataset.urls
    wx.previewImage({ current, urls })
  },

  deletePost(e) {
    const postId = e.currentTarget.dataset.id
    if (!postId) return

    wx.showModal({
      title: '删除帖子',
      content: '确定要删除这条帖子吗？删除后将不再显示。',
      confirmText: '删除',
      confirmColor: '#e53935',
      success: (res) => {
        if (!res.confirm) return

        wx.showLoading({ title: '删除中...' })
        wx.cloud.callFunction({
          name: 'deletePost',
          data: { postId }
        }).then(r => {
          wx.hideLoading()
          if (r.result && r.result.ok) {
            this.setData({
              posts: this.data.posts.filter(p => p._id !== postId)
            })
            wx.showToast({ title: '已删除' })
          } else {
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }).catch(err => {
          wx.hideLoading()
          console.error(err)
          wx.showToast({ title: '删除失败', icon: 'none' })
        })
      }
    })
  },

  openComments(e) {
    const postId = e.currentTarget.dataset.id
    if (!postId) return

    const stored = wx.getStorageSync('nlcs_last_seen_interactions_per_post')
    const storedMap = (stored && typeof stored === 'object') ? stored : {}
    storedMap[postId] = Date.now()
    wx.setStorageSync('nlcs_last_seen_interactions_per_post', storedMap)

    const nextUnreadMap = { ...(this.data.unreadMap || {}) }
    if (nextUnreadMap[postId]) {
      nextUnreadMap[postId] = { likes: 0, comments: 0, total: 0 }
    }

    wx.showLoading({ title: '加载中...' })
    app.refreshSession().finally(() => {
      wx.hideLoading()
      this.setData({
        showComments: true,
        currentPostId: postId,
        commentList: [],
        unreadMap: nextUnreadMap
      })
      this.loadComments(postId)
    })
  },

  closeComments() {
    this.setData({
      showComments: false,
      currentPostId: '',
      commentList: []
    })
  },

  loadComments(postId) {
    wx.cloud.callFunction({
      name: 'getComments',
      data: { postId, pageSize: 50 }
    }).then(res => {
      if (!res.result || !res.result.ok) return
      const myOpenid = wx.getStorageSync('nlcs_openid') || ''
      const role = wx.getStorageSync('nlcs_user_role') || 'user'
      const list = (res.result.data || []).map(c => ({
        ...c,
        canEdit: Boolean(c.canEdit || (myOpenid && ((c.openid || c._openid) === myOpenid))),
        canDelete: Boolean(c.canDelete || role === 'admin' || (myOpenid && ((c.openid || c._openid) === myOpenid))),
        time: this.formatTime(new Date(c.createdAt)),
        contentParts: parseTextLinks(c.content || '')
      }))
      this.setData({ commentList: list })
    }).catch(err => {
      console.error(err)
    })
  },

  deleteComment(e) {
    const commentId = e.currentTarget.dataset.id
    const postId = this.data.currentPostId
    if (!commentId || !postId) return

    wx.showModal({
      title: '删除评论',
      content: '确定删除这条评论吗？',
      confirmText: '删除',
      confirmColor: '#e53935',
      success: (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...' })
        wx.cloud.callFunction({
          name: 'deleteComment',
          data: { commentId }
        }).then(r => {
          wx.hideLoading()
          if (r.result && r.result.ok) {
            this.setData({
              commentList: this.data.commentList.filter(c => c._id !== commentId),
              posts: this.data.posts.map(p => {
                if (p._id !== postId) return p
                const next = { ...p }
                next.comments = Math.max(Number(next.comments || 0) - 1, 0)
                return next
              })
            })
            wx.showToast({ title: '已删除' })
          } else {
            const msg = (r && r.result && r.result.message) ? String(r.result.message) : ''
            wx.showToast({ title: msg ? `删除失败(${msg})` : '删除失败', icon: 'none' })
          }
        }).catch(err => {
          wx.hideLoading()
          console.error(err)
          const msg = err && (err.errMsg || err.message) ? String(err.errMsg || err.message) : ''
          wx.showToast({ title: msg ? `删除失败(${msg})` : '删除失败', icon: 'none' })
        })
      }
    })
  },
  editComment(e) {
    const commentId = e.currentTarget.dataset.id
    const postId = this.data.currentPostId
    const oldContent = String(e.currentTarget.dataset.content || '').trim()
    if (!commentId || !postId) return

    wx.showModal({
      title: '编辑评论',
      content: oldContent,
      editable: true,
      placeholderText: '请输入评论内容',
      confirmText: '保存',
      success: (res) => {
        if (!res.confirm) return
        const content = String(res.content || '').trim()
        if (!content) {
          wx.showToast({ title: '请输入评论内容', icon: 'none' })
          return
        }
        if (content.length > 3000) {
          wx.showToast({ title: '评论最多3000字', icon: 'none' })
          return
        }

        wx.showLoading({ title: '保存中...' })
        wx.cloud.callFunction({
          name: 'updateComment',
          data: { commentId, content }
        }).then(r => {
          wx.hideLoading()
          if (r.result && r.result.ok) {
            this.setData({
              commentList: this.data.commentList.map(c => {
                if (c._id !== commentId) return c
                return { ...c, content, contentParts: parseTextLinks(content) }
              })
            })
            wx.showToast({ title: '已保存' })
          } else {
            const msg = (r && r.result && r.result.message) ? String(r.result.message) : ''
            wx.showToast({ title: msg ? `保存失败(${msg})` : '保存失败', icon: 'none' })
          }
        }).catch(err => {
          wx.hideLoading()
          console.error(err)
          const msg = err && (err.errMsg || err.message) ? String(err.errMsg || err.message) : ''
          wx.showToast({ title: msg ? `保存失败(${msg})` : '保存失败', icon: 'none' })
        })
      }
    })
  },
  editPost(e) {
    const postId = e.currentTarget.dataset.id
    if (!postId) return
    wx.navigateTo({ url: `/pages/edit-post/edit-post?id=${postId}` })
  },
  onLinkTap(e) {
    const type = String(e.currentTarget.dataset.type || '').trim()
    const href = String(e.currentTarget.dataset.href || '').trim()
    if (!href) return

    if (type === 'email') {
      wx.setClipboardData({
        data: href,
        success: () => wx.showToast({ title: '已复制邮箱' })
      })
      return
    }

    const url = normalizeUrl(href)
    // 个人小程序不支持 web-view 业务域名配置，只能使用 clipboard 复制
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '链接已复制，请在浏览器打开', icon: 'none' })
    })

    // 原逻辑保留备用：
    // if (!/^https?:\/\//i.test(url)) {
    //   wx.setClipboardData({
    //     data: url,
    //     success: () => wx.showToast({ title: '已复制链接' })
    //   })
    //   return
    // }
    // wx.navigateTo({ url: `/pages/webview/webview?url=${encodeURIComponent(url)}` })
  }
})
