const app = getApp()
const { parseTextLinks, normalizeUrl } = require('../../utils/linkify')

// Helper to escape regex special characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper to highlight keywords in text parts
function highlightContent(parts, keyword) {
  if (!keyword || !keyword.trim()) return parts;

  const keywords = keyword.trim().split(/\s+/).filter(k => k);
  if (keywords.length === 0) return parts;

  const regex = new RegExp(`(${keywords.map(escapeRegExp).join('|')})`, 'gi');
  const newParts = [];

  parts.forEach(part => {
    if (part.type === 'text') {
      const text = part.text;
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          newParts.push({ type: 'text', text: text.slice(lastIndex, match.index) });
        }
        newParts.push({ type: 'highlight', text: match[0] });
        lastIndex = regex.lastIndex;
      }

      if (lastIndex < text.length) {
        newParts.push({ type: 'text', text: text.slice(lastIndex) });
      }
    } else {
      newParts.push(part);
    }
  });

  return newParts;
}

Page({
  data: {
    posts: [],
    approved: false,
    categories: ['闲置转让', '活动召集', '互助问答', '失物招领', '学习交流', '生活分享'],
    selectedCategory: '',
    sort: 'latest',
    hasImages: false,
    onlyCollected: false,
    keyword: '',
    page: 1,
    hasMore: true,
    isLoading: false,
    error: '',
    
    // Author Info Modal
    showAuthorModal: false,
    authorInfo: {
      loading: false,
      error: false,
      isEmpty: false
    }
  },

  onLoad() {
    this.loadPosts(true)
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch() {
    this.loadPosts(true)
  },

  clearSearch() {
    this.setData({ keyword: '' })
    this.loadPosts(true)
  },

  onShow() {
    app.refreshSession().finally(() => {
      const ok = this.checkApprovedStatus()
      this.setData({
        approved: ok
      })
      app.refreshUnread()
      
      if (ok) {
        this.loadPosts(true)
        this.checkStudentInfo()
      } else {
        this.setData({ posts: [] }) // Clear posts if not approved
      }
    })
  },

  checkStudentInfo() {
    const application = wx.getStorageSync('nlcs_application')
    if (!application || !application.student) return

    // 1. Check Missing Current Class
    if (!application.student.currentClass) {
      wx.showModal({
        title: '信息完善',
        content: '请完善孩子的“目前班级”信息，以便更好地使用社群功能。',
        confirmText: '去完善',
        showCancel: false,
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/child-info/child-info' })
          }
        }
      })
      return
    }

    // 2. Check "New Student" (Weekly Reminder)
    let hasNewStudent = false
    if (String(application.student.currentClass).includes('新生')) {
      hasNewStudent = true
    } else if (application.siblings && Array.isArray(application.siblings)) {
      if (application.siblings.some(s => String(s.currentClass || '').includes('新生'))) {
        hasNewStudent = true
      }
    }

    if (hasNewStudent) {
      const lastRemind = Number(wx.getStorageSync('nlcs_new_student_remind_last_time') || 0)
      const nowTime = Date.now()
      if (nowTime - lastRemind > 7 * 24 * 60 * 60 * 1000) {
        wx.showModal({
          title: '班级信息更新',
          content: '您的孩子目前班级填写为“新生”，如果已经分班，请及时更新为完整班级名（如 7A）。',
          confirmText: '去更新',
          cancelText: '暂不',
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({ url: '/pages/child-info/child-info' })
            }
            // Update last remind time
            wx.setStorageSync('nlcs_new_student_remind_last_time', nowTime)
          }
        })
        return
      }
    }

    // 3. Annual Reminder (Aug 15)
    const now = new Date()
    if (now.getMonth() === 7 && now.getDate() === 15) {
       const key = `nlcs_class_remind_${now.getFullYear()}`
       if (!wx.getStorageSync(key)) {
          wx.showModal({
             title: '新学年提醒',
             content: '今天是8月15日，新学年即将开始，请记得更新孩子的“目前班级”信息哦！',
             confirmText: '去更新',
             cancelText: '知道了',
             success: (res) => {
               wx.setStorageSync(key, 'true')
               if (res.confirm) {
                 wx.navigateTo({ url: '/pages/child-info/child-info' })
               }
             }
          })
       }
    }
  },

  checkApprovedStatus() {
    const application = wx.getStorageSync('nlcs_application')
    if (application && application.status === 'approved') {
      return true
    }
    return false
  },

  ensureApproved() {
    if (this.data.approved) return true
    
    wx.showModal({
      title: '提示',
      content: '请先完成家长认证审核',
      confirmText: '去查看',
      success: res => {
        if (res.confirm) {
          wx.navigateTo({ url: '/pages/status/status' })
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

  goPost() {
    if (!this.ensureApproved()) return
    wx.navigateTo({ url: '/pages/post/post' })
  },

  loadPosts(reset = false) {
    if (!wx.cloud) return
    if (this.data.isLoading) return

    if (reset) {
      this.setData({ page: 1, hasMore: true, error: '' })
    }
    if (!this.data.hasMore && !reset) return

    this.setData({ isLoading: true })
    wx.showLoading({ title: '加载中' })

    const myOpenid = wx.getStorageSync('nlcs_openid') || ''
    const role = wx.getStorageSync('nlcs_user_role') || 'user'
    const keyword = this.data.keyword

    wx.cloud.callFunction({
      name: 'getPosts',
      data: {
        page: this.data.page,
        pageSize: 10,
        category: this.data.selectedCategory,
        sort: this.data.sort,
        hasImages: this.data.hasImages,
        filter: this.data.onlyCollected ? 'collected' : '',
        keyword: keyword
      }
    }).then(res => {
      wx.hideLoading()
      this.setData({ isLoading: false })
      if (res.result.success) {
        const newPosts = res.result.data.map(item => {
          const postOpenid = item.openid || item._openid
          const isOwner = Boolean(myOpenid && postOpenid && postOpenid === myOpenid)
          item.time = this.formatTime(new Date(item.createTime))
          item.canEdit = isOwner
          item.canDelete = role === 'admin' || isOwner
          
          // Process content with highlight
          let parts = parseTextLinks(item.content || '')
          item.contentParts = highlightContent(parts, keyword)

          // Process matchComments with highlight
          if (item.matchComments && item.matchComments.length > 0) {
            item.matchComments = item.matchComments.map(mc => {
              const mcParts = parseTextLinks(mc.content || '')
              mc.contentParts = highlightContent(mcParts, keyword)
              return mc
            })
          }

          return item
        })
        
        this.setData({
          posts: reset ? newPosts : this.data.posts.concat(newPosts),
          page: this.data.page + 1,
          hasMore: newPosts.length === 10
        })
        this.tryOpenPendingComments()
      } else {
        this.setData({ error: '加载失败，请稍后重试' })
      }
    }).catch(err => {
      wx.hideLoading()
      this.setData({ isLoading: false, error: '网络错误或服务不可用' })
      console.error(err)
    })
  },

  selectCategory(e) {
    const category = String(e.currentTarget.dataset.category || '').trim()
    if (category === this.data.selectedCategory) return
    this.setData({ selectedCategory: category })
    this.loadPosts(true)
  },

  setSort(e) {
    const sort = String(e.currentTarget.dataset.sort || '').trim()
    if (!sort) return
    if (sort === this.data.sort) return
    this.setData({ sort })
    this.loadPosts(true)
  },

  toggleHasImages() {
    this.setData({ hasImages: !this.data.hasImages })
    this.loadPosts(true)
  },

  toggleLike(e) {
    if (!this.ensureApproved()) return
    const postId = e.currentTarget.dataset.id
    if (!postId) return

    // Optimistic update
    const posts = this.data.posts.map(p => {
      if (p._id !== postId) return p
      const next = { ...p }
      const wasLiked = next.likedByMe
      next.likedByMe = !wasLiked
      const baseLikes = Number(next.likes || 0)
      next.likes = !wasLiked ? baseLikes + 1 : Math.max(baseLikes - 1, 0)
      return next
    })
    this.setData({ posts })

    wx.cloud.callFunction({
      name: 'toggleLike',
      data: { postId }
    }).then(res => {
      if (!res.result || !res.result.ok) {
        // Revert on failure
        wx.showToast({ title: '操作失败', icon: 'none' })
        this.loadPosts(false) // Or revert manually
        return
      }
      // Success, do nothing or update with server value if needed
    }).catch(err => {
      console.error(err)
      wx.showToast({ title: '操作失败', icon: 'none' })
      // Revert
      this.loadPosts(false)
    })
  },

  toggleCollected() {
    this.setData({ onlyCollected: !this.data.onlyCollected })
    this.loadPosts(true)
  },

  toggleCollection(e) {
    if (!this.ensureApproved()) return
    const type = e.currentTarget.dataset.type // 'post' or 'comment'
    const id = e.currentTarget.dataset.id
    const postId = e.currentTarget.dataset.postid // required for comment

    if (!id) return

    wx.cloud.callFunction({
      name: 'toggleCollection',
      data: {
        type,
        targetId: id,
        postId
      }
    }).then(res => {
      if (!res.result || !res.result.ok) {
        wx.showToast({ title: '操作失败', icon: 'none' })
        return
      }
      
      const collected = res.result.collected
      
      if (type === 'post') {
        const posts = this.data.posts.map(p => {
          if (p._id !== id) return p
          return { ...p, isCollected: collected }
        })
        this.setData({ posts })
      } else if (type === 'comment') {
        const commentList = this.data.commentList.map(c => {
          if (c._id !== id) return c
          return { ...c, isCollected: collected }
        })
        this.setData({ commentList })
      }
      
      wx.showToast({ title: collected ? '已收藏' : '已取消收藏', icon: 'none' })
    }).catch(err => {
      console.error(err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    })
  },

  tryOpenPendingComments() {
    const postId = String(wx.getStorageSync('nlcs_open_comments_postId') || '').trim()
    if (!postId) return

    const post = this.data.posts.find(p => p._id === postId)
    if (post) {
      wx.removeStorageSync('nlcs_open_comments_postId')
      this.openComments({ currentTarget: { dataset: { id: postId } } })
    }
  },

  openComments(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({
      url: `/pages/post-detail/post-detail?id=${id}`
    })
  },

  editPost(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/post/post?id=${id}`
    })
  },

  deletePost(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中' })
          wx.cloud.callFunction({
            name: 'deletePost',
            data: { id }
          }).then(res => {
            wx.hideLoading()
            if (res.result.success) {
              wx.showToast({ title: '已删除' })
              // Remove from list
              const posts = this.data.posts.filter(p => p._id !== id)
              this.setData({ posts })
            } else {
              wx.showToast({ title: '删除失败', icon: 'none' })
            }
          }).catch(err => {
            wx.hideLoading()
            console.error(err)
            wx.showToast({ title: '删除失败', icon: 'none' })
          })
        }
      }
    })
  },

  previewImage(e) {
    const current = e.currentTarget.dataset.current
    const urls = e.currentTarget.dataset.urls
    wx.previewImage({
      current,
      urls
    })
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
    if (diff < 7 * day) return Math.floor(diff / day) + '天前'
    
    const y = date.getFullYear()
    const m = date.getMonth() + 1
    const d = date.getDate()
    return `${y}年${m}月${d}日`
  },

  onLinkTap(e) {
    const type = e.currentTarget.dataset.type
    const href = e.currentTarget.dataset.href
    if (type === 'url') {
      wx.setClipboardData({
        data: href,
        success: () => wx.showToast({ title: '链接已复制' })
      })
    } else if (type === 'email') {
      wx.setClipboardData({
        data: href,
        success: () => wx.showToast({ title: '邮箱已复制' })
      })
    }
  },

  showAuthorInfo(e) {
    const openid = e.currentTarget.dataset.openid
    const author = e.currentTarget.dataset.author
    const avatar = e.currentTarget.dataset.avatar

    if (!openid) return

    this.setData({ 
      showAuthorModal: true,
      authorInfo: {
        loading: true,
        error: false,
        isEmpty: false,
        author,
        avatar
      }
    })

    wx.cloud.callFunction({
      name: 'getPublicProfile',
      data: { targetOpenid: openid }
    }).then(res => {
      if (res.result.success) {
        const data = res.result.data || {}
        const isEmpty = !data.childName && !data.admissionYear && !data.entryGradeAtEntry && !data.phone && !data.email && !data.address && !data.currentClass
        
        this.setData({
          authorInfo: {
            loading: false,
            error: false,
            isEmpty,
            author, // Keep original author name
            avatar, // Keep original avatar
            childName: data.childName,
            admissionYear: data.admissionYear,
            entryGradeAtEntry: data.entryGradeAtEntry,
            currentClass: data.currentClass,
            phone: data.phone,
            email: data.email,
            address: data.address
          }
        })
      } else {
        this.setData({
          'authorInfo.loading': false,
          'authorInfo.error': true
        })
      }
    }).catch(err => {
      console.error(err)
      this.setData({
        'authorInfo.loading': false,
        'authorInfo.error': true
      })
    })
  },

  closeAuthorModal() {
    this.setData({ showAuthorModal: false })
  },
  
  // Prevent bubble for share button
  preventBubble() {}
})
