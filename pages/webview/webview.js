const { normalizeUrl } = require('../../utils/linkify')

Page({
  data: {
    url: ''
  },

  onLoad(options) {
    const raw = String((options && options.url) || '').trim()
    const decoded = raw ? decodeURIComponent(raw) : ''
    const url = normalizeUrl(decoded)

    if (!/^https?:\/\//i.test(url)) {
      wx.showToast({ title: '链接格式不支持', icon: 'none' })
      this.setData({ url: '' })
      return
    }

    this.setData({ url })
  }
})

