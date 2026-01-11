const app = getApp()
const { parseTextLinks, normalizeUrl } = require('../../utils/linkify')
const { formatTimeAgo } = require('../../utils/util.js')

Page({
  data: {
    post: null,
    loading: true,
    comments: [],
    loadingComments: false,
    commentInput: '',
    showAuthorModal: false,
    authorInfo: {},
    isAdmin: false
  },

  onLoad(options) {
    if (options.id) {
      this.postId = options.id
      this.loadPost()
      this.loadComments()
    } else {
      wx.showToast({ title: '帖子不存在', icon: 'none' })
      setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 1500)
    }
    
    const role = wx.getStorageSync('nlcs_user_role')
    this.setData({ isAdmin: role === 'admin' })
  },

  onPullDownRefresh() {
    Promise.all([this.loadPost(), this.loadComments()]).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  loadComments() {
    this.setData({ loadingComments: true })
    return wx.cloud.callFunction({
      name: 'getComments',
      data: { postId: this.postId }
    }).then(res => {
      if (res.result && res.result.success) {
        const comments = (res.result.data || []).map(c => ({
            ...c,
            timeDisplay: formatTimeAgo(c.createTime)
        }))
        this.setData({
          comments: comments,
          loadingComments: false
        })
      } else {
        this.setData({ loadingComments: false })
      }
    }).catch(err => {
      console.error(err)
      this.setData({ loadingComments: false })
    })
  },

  deleteComment(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    
    wx.showModal({
      title: '提示',
      content: '确定要删除这条评论吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中' })
          wx.cloud.callFunction({
            name: 'deleteComment',
            data: { commentId: id, postId: this.postId }
          }).then(res => {
            wx.hideLoading()
            if (res.result && res.result.success) {
              wx.showToast({ title: '删除成功' })
              // Update local list
              const newComments = this.data.comments.filter(c => c._id !== id)
              this.setData({ 
                comments: newComments,
                'post.comments': Math.max(0, (this.data.post.comments || 1) - 1)
              })
            } else {
              wx.showToast({ title: '删除失败', icon: 'none' })
            }
          }).catch(err => {
            wx.hideLoading()
            console.error(err)
            wx.showToast({ title: '删除出错', icon: 'none' })
          })
        }
      }
    })
  },

  loadPost() {
    return wx.cloud.callFunction({
      name: 'getPosts',
      data: { id: this.postId }
    }).then(res => {
      if (res.result && res.result.success && res.result.data && res.result.data.length > 0) {
        const post = res.result.data[0]
        const myOpenid = wx.getStorageSync('nlcs_openid') || ''
        const role = wx.getStorageSync('nlcs_user_role') || 'user'
        const postOpenid = post.openid || post._openid
        const isOwner = Boolean(myOpenid && postOpenid && postOpenid === myOpenid)
        
        post.time = formatTimeAgo(post.createTime)
        post.canEdit = isOwner
        post.canDelete = role === 'admin' || isOwner
        
        // Process content links
        if (post.content) {
          post.contentParts = parseTextLinks(post.content)
        }

        this.setData({ 
          post: post,
          loading: false 
        })
      } else {
        this.setData({ loading: false })
        wx.showToast({ title: '帖子加载失败', icon: 'none' })
      }
    }).catch(err => {
      console.error(err)
      this.setData({ loading: false })
    })
  },

  deletePost(e) {
    const postId = this.postId
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
            wx.showToast({ title: '已删除' })
            setTimeout(() => {
              wx.switchTab({ url: '/pages/index/index' })
            }, 1500)
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

  editPost() {
    if (!this.postId) return
    wx.navigateTo({ url: `/pages/edit-post/edit-post?id=${this.postId}` })
  },

  toggleLike() {
    if (!this.data.post) return
    const post = this.data.post
    const action = post.likedByMe ? 'unlike' : 'like'
    
    const newLikes = post.likedByMe ? post.likes - 1 : post.likes + 1
    this.setData({
      'post.likedByMe': !post.likedByMe,
      'post.likes': newLikes
    })

    wx.cloud.callFunction({
      name: 'toggleLike',
      data: { postId: post._id, action }
    }).catch(() => {
      this.setData({
        'post.likedByMe': post.likedByMe,
        'post.likes': post.likes
      })
    })
  },

  toggleCollection(e) {
    const type = e.currentTarget.dataset.type
    const id = e.currentTarget.dataset.id
    const postId = this.data.post._id
    
    if (!id) return

    wx.cloud.callFunction({
      name: 'toggleCollection',
      data: {
        type,
        targetId: id,
        postId: type === 'comment' ? postId : undefined
      }
    }).then(res => {
      if (!res.result || !res.result.ok) {
        wx.showToast({ title: '操作失败', icon: 'none' })
        return
      }
      
      const collected = res.result.collected
      
      if (type === 'post') {
        this.setData({
          'post.isCollected': collected
        })
      } else if (type === 'comment') {
        const comments = this.data.comments.map(c => {
          if (c._id !== id) return c
          return { ...c, isCollected: collected }
        })
        this.setData({ comments })
      }
      
      wx.showToast({ title: collected ? '已收藏' : '已取消收藏', icon: 'none' })
    }).catch(err => {
      console.error(err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    })
  },
  
  onCommentInput(e) {
    this.setData({ commentInput: e.detail.value })
  },

  submitComment() {
    const content = this.data.commentInput.trim()
    if (!content) return
    
    const data = {
      postId: this.postId,
      content
    }
    
    console.log('[submitComment] sending data:', data)

    wx.showLoading({ title: '发送中' })
    
    wx.cloud.callFunction({
      name: 'addComment',
      data
    }).then(res => {
      wx.hideLoading()
          console.log('[submitComment] result:', res)
          
          if (res.result && (res.result.success || res.result.ok)) {
            wx.showToast({ title: '评论成功', icon: 'success' })
            this.setData({ 
              commentInput: '',
              focusInput: false
            })
            // Reload comments to show the new one
            this.loadComments()
            this.setData({ 'post.comments': (this.data.post.comments || 0) + 1 })
          } else {
            console.error('[submitComment] failed with result:', JSON.stringify(res))
            const msg = (res.result && res.result.message) ? res.result.message : '未知错误'
            wx.showToast({ title: '评论失败: ' + msg, icon: 'none', duration: 3000 })
          }
        }).catch(err => {
          wx.hideLoading()
          console.error('[submitComment] error:', err)
          wx.showToast({ title: '评论失败: 网络或服务器错误', icon: 'none', duration: 3000 })
        })
  },
  
  previewImage(e) {
    const current = e.currentTarget.dataset.current
    const urls = e.currentTarget.dataset.urls
    wx.previewImage({ current, urls })
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
     const { openid, author, avatar } = e.currentTarget.dataset
    if (!openid) return

    this.setData({
      showAuthorModal: true,
      authorInfo: {
        author,
        avatar,
        loading: true,
        error: false
      }
    })

    wx.cloud.callFunction({
      name: 'getPublicProfile',
      data: { targetOpenid: openid }
    }).then(res => {
      if (res.result && res.result.ok) {
        const data = res.result.data || {}
        this.setData({
          'authorInfo.loading': false,
          'authorInfo.childName': data.childName,
          'authorInfo.admissionYear': data.admissionYear,
          'authorInfo.entryGradeAtEntry': data.entryGradeAtEntry,
          'authorInfo.currentClass': data.currentClass,
          'authorInfo.phone': data.phone,
          'authorInfo.email': data.email,
          'authorInfo.address': data.address,
          'authorInfo.isEmpty': !data.childName && !data.phone && !data.email && !data.address
        })
      } else {
        this.setData({
          'authorInfo.loading': false,
          'authorInfo.error': true
        })
      }
    }).catch(() => {
      this.setData({
        'authorInfo.loading': false,
        'authorInfo.error': true
      })
    })
  },
  
  closeAuthorModal() {
    this.setData({ showAuthorModal: false })
  },
  
  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  onShareAppMessage(res) {
    const post = this.data.post
    if (!post) return {
      title: '社群帖子',
      path: '/pages/index/index'
    }

    let title = post.content || '分享一个帖子'
    if (title.length > 30) title = title.substring(0, 30) + '...'
    
    if (res.from === 'button' && res.target.dataset.comment) {
      const comment = res.target.dataset.comment
      title = `评论: ${comment.content}`
      if (title.length > 30) title = title.substring(0, 30) + '...'
    }

    return {
      title,
      path: `/pages/post-detail/post-detail?id=${post._id}`,
      imageUrl: (post.images && post.images.length > 0) ? post.images[0] : undefined
    }
  },
  
  onShareTimeline() {
     const post = this.data.post
    if (!post) return
     let title = post.content || '社群帖子'
    return {
      title,
      query: `id=${post._id}`,
      imageUrl: (post.images && post.images.length > 0) ? post.images[0] : undefined
    }
  }
})
