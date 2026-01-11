function normalizeApplications(list) {
  const arr = Array.isArray(list) ? list : []
  return arr
    .filter(x => x && x.student && x.status)
    .map(x => {
      const relation = x.student.relation || ''
      const relationOther = x.student.relationOther || ''
      const relationFull = relation === '其他' && relationOther ? `其他（${relationOther}）` : relation
      const nameParts = []
      if (x.student.englishName) nameParts.push(String(x.student.englishName))
      if (x.student.chineseName) nameParts.push(String(x.student.chineseName))
      const studentName = nameParts.join(' ')
      return {
        ...x,
        relationFull,
        studentName
      }
    })
}

const app = getApp()

Page({
  data: {
    isAdmin: false,
    pendingApplications: [],
    pendingCount: 0,
    approvedApplications: [],
    approvedRaw: [],
    approvedCount: 0,
    approvedSkip: 0,
    approvedHasMore: true,
    approvedLoading: false,
    approvedKeyword: '',
    adminList: []
  },

  onShow() {
    app.refreshSession().finally(() => {
      const role = wx.getStorageSync('nlcs_user_role') || 'user'
      const isAdmin = role === 'admin'
      this.setData({ isAdmin })
      if (!isAdmin) return
      this.loadPending()
      this.loadApproved(true)
      this.fetchAdminList()
    })
  },

  onPullDownRefresh() {
    if (!this.data.isAdmin) {
      wx.stopPullDownRefresh()
      return
    }
    Promise.all([
      this.loadPending(),
      this.loadApproved(true),
      this.fetchAdminList()
    ]).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  fetchAdminList() {
    wx.cloud.callFunction({
      name: 'manageAdmin',
      data: { action: 'list' }
    }).then(res => {
      if (res.result.ok) {
        this.setData({ adminList: res.result.admins || [] })
      }
    }).catch(err => console.error('Failed to fetch admin list', err))
  },

  toggleAdmin(e) {
    const { openid, name } = e.currentTarget.dataset
    if (!openid) return

    const isAdmin = this.data.adminList.includes(openid)
    const action = isAdmin ? 'remove' : 'add'
    const actionText = isAdmin ? '移除管理员' : '设为管理员'

    wx.showModal({
      title: '确认操作',
      content: `确定要将用户“${name || openid}”${actionText}吗？`,
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中' })
          wx.cloud.callFunction({
            name: 'manageAdmin',
            data: { action, openid }
          }).then(res => {
            wx.hideLoading()
            if (res.result.ok) {
              wx.showToast({ title: '操作成功' })
              this.fetchAdminList()
            } else {
              wx.showToast({ title: res.result.message || '操作失败', icon: 'none' })
            }
          }).catch(err => {
            wx.hideLoading()
            console.error(err)
            wx.showToast({ title: '调用失败', icon: 'none' })
          })
        }
      }
    })
  },

  loadPending() {
    if (!wx.cloud) return
    wx.showLoading({ title: '加载中...' })
    wx.cloud.callFunction({
      name: 'listApplications',
      data: { status: 'pending', limit: 50 }
    })
      .then((res) => {
        const result = res && res.result ? res.result : {}
        const list = result.applications || []
        const pending = normalizeApplications(list)
        this.setData({
          pendingApplications: pending,
          pendingCount: pending.length
        })
      })
      .finally(() => {
        wx.hideLoading()
      })
  },

  loadApproved(reset = false) {
    if (!wx.cloud) return
    if (this.data.approvedLoading) return

    const limit = 30
    const skip = reset ? 0 : this.data.approvedSkip
    this.setData({ approvedLoading: true })
    wx.showLoading({ title: '加载中...' })

    wx.cloud.callFunction({
      name: 'listApplications',
      data: { status: 'approved', limit, skip }
    }).then(res => {
      const result = res && res.result ? res.result : {}
      const list = result.applications || []
      const normalized = normalizeApplications(list)
      const nextRaw = reset ? normalized : this.data.approvedRaw.concat(normalized)
      this.setData({
        approvedRaw: nextRaw,
        approvedSkip: skip + normalized.length,
        approvedHasMore: normalized.length === limit
      })
      this.applyApprovedFilter()
    }).finally(() => {
      wx.hideLoading()
      this.setData({ approvedLoading: false })
    })
  },

  onApprovedKeywordInput(e) {
    this.setData({ approvedKeyword: e.detail.value })
    this.applyApprovedFilter()
  },

  onMigrateGrades() {
    wx.showModal({
      title: '确认操作',
      content: '此操作将把所有用户的旧年级（如“一年级”）迁移为新格式（如“G1”），无法撤销。是否继续？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中', mask: true })
          wx.cloud.callFunction({
            name: 'migrateGrades'
          }).then(res => {
            wx.hideLoading()
            if (res.result.ok) {
              wx.showModal({
                title: '完成',
                content: res.result.message,
                showCancel: false
              })
              // Reload lists
              this.loadApproved(true)
            } else {
              wx.showModal({
                title: '错误',
                content: res.result.error || 'Unknown error',
                showCancel: false
              })
            }
          }).catch(err => {
            wx.hideLoading()
            wx.showToast({ title: '调用失败', icon: 'none' })
            console.error(err)
          })
        }
      }
    })
  },

  applyApprovedFilter() {
    const q = String(this.data.approvedKeyword || '').trim().toLowerCase()
    const raw = this.data.approvedRaw || []
    const filtered = q ? raw.filter(x => {
      const studentName = String(x.studentName || '').toLowerCase()
      const relation = String(x.relationFull || '').toLowerCase()
      const email = x.profile && x.profile.email ? String(x.profile.email).toLowerCase() : ''
      const phone = x.profile && x.profile.phone ? String(x.profile.phone).toLowerCase() : ''
      const wechatId = x.profile && x.profile.wechatId ? String(x.profile.wechatId).toLowerCase() : ''
      const openid = String(x.openid || x._id || '').toLowerCase()
      return studentName.includes(q) || relation.includes(q) || email.includes(q) || phone.includes(q) || wechatId.includes(q) || openid.includes(q)
    }) : raw

    this.setData({
      approvedApplications: filtered,
      approvedCount: filtered.length
    })
  },

  loadMoreApproved() {
    if (!this.data.approvedHasMore) return
    this.loadApproved(false)
  },

  revokeApproved(e) {
    const targetOpenid = e.currentTarget.dataset.openid
    if (!targetOpenid || !wx.cloud) return

    wx.showModal({
      title: '撤销用户权限',
      content: '撤销后，该用户将无法继续使用社群功能（可重新提交申请）。',
      confirmText: '撤销',
      confirmColor: '#e03131',
      success: res => {
        if (!res.confirm) return
        wx.showLoading({ title: '处理中...' })
        wx.cloud.callFunction({
          name: 'reviewApplication',
          data: {
            targetOpenid,
            decision: 'rejected',
            reviewNote: '管理员撤销'
          }
        }).then(() => {
          wx.showToast({ title: '已撤销', icon: 'none' })
          this.loadApproved(true)
        }).catch(() => {
          wx.showToast({ title: '操作失败', icon: 'none' })
        }).finally(() => {
          wx.hideLoading()
        })
      }
    })
  },

  previewLetter(e) {
    const fileID = e.currentTarget.dataset.fileid
    if (!fileID || !wx.cloud) return
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: (res) => {
        const item = res.fileList && res.fileList[0]
        if (!item || !item.tempFileURL) return
        wx.previewImage({
          current: item.tempFileURL,
          urls: [item.tempFileURL]
        })
      }
    })
  },

  approve(e) {
    const targetOpenid = e.currentTarget.dataset.openid
    if (!targetOpenid || !wx.cloud) return
    wx.showLoading({ title: '处理中...' })
    wx.cloud.callFunction({
      name: 'reviewApplication',
      data: {
        targetOpenid,
        decision: 'approved',
        reviewNote: ''
      }
    })
      .then(() => {
        wx.showToast({ title: '已通过', icon: 'success' })
        this.loadPending()
        this.loadApproved(true)
      })
      .catch(() => {
        wx.showToast({ title: '操作失败', icon: 'none' })
      })
      .finally(() => {
        wx.hideLoading()
      })
  },

  reject(e) {
    const targetOpenid = e.currentTarget.dataset.openid
    if (!targetOpenid || !wx.cloud) return

    wx.showActionSheet({
      itemList: ['信息不完整', '通知书截图不清晰', '信息与通知书不一致', '其他'],
      success: (res) => {
        const reasons = ['信息不完整', '通知书截图不清晰', '信息与通知书不一致', '其他']
        const note = reasons[res.tapIndex] || '其他'
        wx.showLoading({ title: '处理中...' })
        wx.cloud.callFunction({
          name: 'reviewApplication',
          data: {
            targetOpenid,
            decision: 'rejected',
            reviewNote: note
          }
        })
          .then(() => {
            wx.showToast({ title: '已拒绝', icon: 'none' })
            this.loadPending()
            this.loadApproved(true)
          })
          .catch(() => {
            wx.showToast({ title: '操作失败', icon: 'none' })
          })
          .finally(() => {
            wx.hideLoading()
          })
      }
    })
  }
})
