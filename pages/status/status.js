function getStatusText(status) {
  if (status === 'approved') return '已通过'
  if (status === 'pending') return '审核中'
  if (status === 'rejected') return '未通过'
  return '未申请'
}

function getStatusDesc(status) {
  if (status === 'approved') return '你已通过审核，可以正常使用小程序功能'
  if (status === 'pending') return '管理员审核通过后即可使用全部功能'
  if (status === 'rejected') return '请核对信息并重新提交审核'
  return '请先提交学生信息并上传入学通知书截图'
}

const app = getApp()

Page({
  data: {
    status: 'none',
    statusText: '',
    statusDesc: '',
    statusClass: 'none',
    application: null,
    reviewNote: '',
    relationFull: '',
    isAdmin: false
  },

  onShow() {
    wx.showLoading({ title: '加载中...' })
    app.refreshSession().then(res => {
      console.log('refreshSession result:', res)
      // 调试弹窗：显示拉取到的状态
      const status = res.application ? res.application.status : 'null'
      /*
      wx.showModal({
        title: '调试信息',
        content: `云端状态: ${status}\n角色: ${res.role}\nOpenID: ${res.openid}`,
        showCancel: false
      })
      */
      this.loadFromStorage()
    }).catch(err => {
      console.error('refreshSession error:', err)
      wx.showModal({
        title: '错误',
        content: '加载状态失败: ' + JSON.stringify(err),
        showCancel: false
      })
    }).finally(() => {
      wx.hideLoading()
    })
  },

  loadFromStorage() {
    const application = wx.getStorageSync('nlcs_application')
    const role = wx.getStorageSync('nlcs_user_role') || 'user'
    const status = application && application.status ? application.status : 'none'
    const relation = application && application.student ? application.student.relation : ''
    const relationOther = application && application.student ? application.student.relationOther : ''
    const relationFull = relation === '其他' && relationOther ? `其他（${relationOther}）` : relation
    this.setData({
      status,
      statusText: getStatusText(status),
      statusDesc: getStatusDesc(status),
      statusClass: status || 'none',
      application: application || null,
      reviewNote: (application && application.reviewNote) ? application.reviewNote : '',
      relationFull,
      isAdmin: role === 'admin'
    })
  },

  goRegister() {
    wx.redirectTo({
      url: '/pages/register/register'
    })
  },

  enterApp() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  },

  goAdmin() {
    wx.navigateTo({
      url: '/pages/admin/admin'
    })
  },

  previewLetter() {
    const application = this.data.application
    if (!application) return
    const fileID = application.letterFileId
    if (fileID && wx.cloud) {
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
      return
    }
    if (application.letterImagePath) {
      wx.previewImage({
        current: application.letterImagePath,
        urls: [application.letterImagePath]
      })
    }
  }
})
