const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    documents: [],
    allDocuments: [], // 存储所有文档，用于本地搜索
    keyword: '',
    isAdmin: false,
    isApproved: false, // New state
    loading: false
  },

  onLoad(options) {
    if (options && options.keyword) {
      this.setData({ keyword: String(options.keyword || '') })
    }
  },

  onPullDownRefresh() {
    this.setData({ keyword: '' }) // 下拉刷新时清空搜索
    this.loadDocuments().then(() => {
      wx.stopPullDownRefresh()
    })
  },
  
  // 搜索输入
  onSearchInput(e) {
    let keyword = ''
    if (e.type === 'input') {
      keyword = e.detail.value
    }
    // 如果是点击清除按钮
    if (e.currentTarget.dataset.value === '') {
      keyword = ''
    }
    
    this.setData({ keyword })
    this.filterDocuments(keyword)
  },

  // 本地过滤
  filterDocuments(keyword) {
    if (!keyword) {
      this.setData({ documents: this.data.allDocuments })
      return
    }
    
    // Stop words and synonyms logic (simplified for local execution)
    const STOP_WORDS = [
      '请问', '有没有', '有吗', '知道', '什么', '在哪里', '求', '想找', '的', '是', '啊', '吗', '呢', '了', 
      '吧', '呀', '么', '怎么', '如何', '能', '不能', '可以', '不可以', '帮我', '找', '一下', '告诉', 
      '我', '你', '他', '她', '它', '我们', '你们', '他们', '这个', '那个', '这些', '那些', '这里', '那里',
      '学校', '老师', '家长', 
      '年', '月', '日', '号', 
      '有', '在', '看', '见', '去', '来', '上', '下', '里', '外' 
    ]
    const SYNONYMS = {
      '校历': ['term dates', 'calendar', 'calendar'],
      'term dates': ['校历'],
      'calendar': ['校历'],
      '校车': ['bus', 'shuttle'],
      'bus': ['校车'],
      '校服': ['uniform'],
      'uniform': ['校服'],
      '食堂': ['menu', 'food', 'lunch'],
      'menu': ['食堂', '菜单'],
      'cca': ['课外活动', '兴趣班'],
      '课外活动': ['cca'],
      '兴趣班': ['cca']
    }

    let clean = String(keyword || '').trim()
    const keywords = []

    // 1. Extract years
    clean = clean.replace(/20\d{2}/g, (match) => {
      keywords.push(match)
      return ' '
    })

    // 2. Remove stop words
    STOP_WORDS.sort((a, b) => b.length - a.length).forEach(w => {
      clean = clean.split(w).join(' ') 
    })
    
    // 3. Split
    const parts = clean.split(/\s+/)
    parts.forEach(p => {
      const term = p.trim()
      if (term.length > 0) {
        keywords.push(term)
        const lowerTerm = term.toLowerCase()
        if (SYNONYMS[lowerTerm]) {
          keywords.push(...SYNONYMS[lowerTerm])
        }
      }
    })
    
    // If no keywords found (e.g. all stop words), use original
    const searchTerms = keywords.length > 0 ? [...new Set(keywords)] : [keyword.trim()]

    const filtered = this.data.allDocuments.filter(doc => {
      const title = doc.title.toLowerCase()
      // Match ANY keyword
      return searchTerms.some(term => title.includes(term.toLowerCase()))
    })
    
    this.setData({ documents: filtered })
  },

  onShow() {
    app.refreshSession().finally(() => {
        this.checkRole()
        this.checkApproved()
    })
  },

  checkRole() {
    const role = wx.getStorageSync('nlcs_user_role')
    this.setData({
      isAdmin: role === 'admin'
    })
  },

  checkApproved() {
      const application = wx.getStorageSync('nlcs_application')
      const isApproved = application && application.status === 'approved'
      this.setData({ isApproved })
      if (isApproved) {
          this.loadDocuments()
      } else {
          this.setData({ documents: [], allDocuments: [] })
      }
  },

  goStatus() {
    wx.navigateTo({ url: '/pages/status/status' })
  },

  async loadDocuments() {
    this.setData({ loading: true })
    try {
      const res = await db.collection('documents')
        .orderBy('createdAt', 'desc')
        .get()
      
      const list = res.data.map(doc => ({
        ...doc,
        createTimeStr: this.formatDate(new Date(doc.createdAt))
      }))

      this.setData({
        allDocuments: list,
        documents: list // 默认显示全部，如果之前有 keyword 可以在这里再 filter 一次，暂时简单处理
      })
      
      // 如果当前有搜索词，重新过滤一下
      if (this.data.keyword) {
        this.filterDocuments(this.data.keyword)
      }

    } catch (err) {
      console.error(err)
      // 如果集合不存在，第一次可能会报错，忽略或提示
    } finally {
      this.setData({ loading: false })
    }
  },

  formatDate(date) {
    const y = date.getFullYear()
    const m = date.getMonth() + 1
    const d = date.getDate()
    return `${y}-${m < 10 ? '0' + m : m}-${d < 10 ? '0' + d : d}`
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
        
        // 如果不是网络错误，或者已经最后一次重试，则抛出异常
        if (i === retries - 1 || !isNetworkError) throw err
        
        // 等待2秒后重试
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }
  },

  // 管理员：上传文件
  uploadFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'all', // 支持所有类型文件
      success: async (res) => {
        const file = res.tempFiles[0]
        const fileName = file.name
        const filePath = file.path
        
        // 检查文件大小 (50MB = 50 * 1024 * 1024 字节)
        const maxSize = 50 * 1024 * 1024
        if (file.size > maxSize) {
          wx.showToast({
            title: '文件不能超过50MB',
            icon: 'none'
          })
          return
        }

        wx.showLoading({ title: '上传中...' })
        
        try {
          // 1. 上传到云存储 (带重试)
          const cloudPath = `documents/${Date.now()}-${fileName}`
          const uploadRes = await this.uploadWithRetry(cloudPath, filePath)
          
          // 2. 写入数据库
          await db.collection('documents').add({
            data: {
              title: fileName,
              fileID: uploadRes.fileID,
              type: this.getFileType(fileName),
              size: file.size,
              createdAt: db.serverDate(),
              createdBy: app.globalData.openid || ''
            }
          })
          
          wx.showToast({ title: '上传成功' })
          this.loadDocuments()
          
        } catch (err) {
          console.error(err)
          const errMsg = String(err.message || err.errMsg || '')
          let tip = '上传失败'
          if (errMsg.includes('UserNetworkTooSlow')) {
            tip = '网络较慢，上传超时'
          } else if (errMsg.includes('exceed max storage')) {
            tip = '存储空间已满'
          }
          wx.showToast({ title: tip, icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  getFileType(fileName) {
    const suffix = fileName.split('.').pop().toLowerCase()
    if (['pdf'].includes(suffix)) return 'pdf'
    if (['doc', 'docx'].includes(suffix)) return 'word'
    if (['xls', 'xlsx'].includes(suffix)) return 'excel'
    if (['ppt', 'pptx'].includes(suffix)) return 'ppt'
    if (['jpg', 'png', 'jpeg'].includes(suffix)) return 'image'
    return 'file'
  },

  // 打开文档
  async openDocument(e) {
    const doc = e.currentTarget.dataset.doc
    
    wx.showLoading({ title: '打开中...' })
    
    try {
      if (doc.type === 'image') {
        const urlRes = await wx.cloud.getTempFileURL({
          fileList: [doc.fileID]
        })
        const tempUrl = urlRes.fileList[0].tempFileURL
        wx.hideLoading()
        wx.previewImage({
          urls: [tempUrl],
          current: tempUrl
        })
        return
      }

      // Use cloud function to get temp URL (bypasses storage permissions)
      console.log('Requesting temp URL for:', doc.fileID)
      const urlRes = await wx.cloud.callFunction({
        name: 'getTempFileUrls',
        data: { fileIDs: [doc.fileID] }
      })
      
      const fileList = urlRes.result && urlRes.result.fileList ? urlRes.result.fileList : []
      const tempUrl = fileList.length && fileList[0] && fileList[0].tempFileURL ? fileList[0].tempFileURL : ''
      
      if (!tempUrl) {
          console.error('Failed to get tempFileURL:', urlRes)
          throw new Error('get_temp_url_failed')
      }
      
      console.log('Got temp URL:', tempUrl)
      
      // Use wx.downloadFile with the public/temp URL
      const downloadRes = await new Promise((resolve, reject) => {
          wx.downloadFile({
              url: tempUrl,
              success: resolve,
              fail: reject
          })
      })
      
      console.log('Download success:', downloadRes)
      if (!downloadRes.tempFilePath) {
        throw new Error('download_failed_no_path')
      }

      let filePath = downloadRes.tempFilePath
      
      // Get extension from fileID first (more reliable), fallback to title
      // Handle potential query params or odd paths just in case
      let fileType = ''
      
      const getExt = (str) => {
          if (!str) return ''
          // Remove query params if any
          const cleanStr = str.split('?')[0].split('#')[0]
          const parts = cleanStr.split('.')
          if (parts.length > 1) {
              return parts.pop().toLowerCase()
          }
          return ''
      }

      const idExt = getExt(doc.fileID)
      const titleExt = getExt(doc.title)
      
      // Use ID extension if it looks valid (2-4 chars), otherwise title extension
      if (idExt && idExt.length >= 2 && idExt.length <= 4) {
          fileType = idExt
      } else {
          fileType = titleExt
      }
      
      console.log('Determined fileType:', fileType)
      
      const supportedTypes = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf']
      const isSupported = supportedTypes.includes(fileType)

      // Android Fix: Always try to save with correct extension if supported
      if (isSupported) {
          try {
              const fs = wx.getFileSystemManager()
              const newPath = `${wx.env.USER_DATA_PATH}/open_${Date.now()}.${fileType}`
              // Copy the temp file to a path with correct extension
              fs.copyFileSync(downloadRes.tempFilePath, newPath)
              filePath = newPath
              console.log('File renamed to:', filePath)
          } catch (e) {
              console.error('File rename failed, falling back to temp path', e)
          }
      }
      
      console.log('Opening document:', filePath, 'type:', fileType)
      
      await wx.openDocument({
        filePath: filePath,
        showMenu: true,
        // Always pass fileType if we know it, helps Android even if path has extension
        fileType: isSupported ? fileType : undefined
      })
    } catch (err) {
      console.error('Open document failed:', err)
      wx.hideLoading()
      
      // Show explicit error to user for debugging
      wx.showModal({
          title: '无法打开文件',
          content: `错误信息: ${err.errMsg || JSON.stringify(err)}\n请截图反馈给管理员`,
          showCancel: false
      })
    } finally {
      wx.hideLoading()
    }
  },

  // 管理员：重命名文档
  renameDocument(e) {
    const doc = e.currentTarget.dataset.doc
    
    wx.showModal({
      title: '重命名',
      content: doc.title,
      editable: true,
      placeholderText: '请输入新的文件名',
      success: async (res) => {
        if (res.confirm && res.content) {
          const newTitle = res.content.trim()
          if (!newTitle || newTitle === doc.title) return

          wx.showLoading({ title: '更新中...' })
          try {
            await db.collection('documents').doc(doc._id).update({
              data: {
                title: newTitle
              }
            })
            
            wx.showToast({ title: '已更新' })
            this.loadDocuments()
          } catch (err) {
            console.error(err)
            wx.showToast({ title: '更新失败', icon: 'none' })
          } finally {
            wx.hideLoading()
          }
        }
      }
    })
  },

  // 管理员：删除文档
  deleteDocument(e) {
    const doc = e.currentTarget.dataset.doc
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除 ${doc.title} 吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' })
          try {
            // 1. 删除数据库记录
            await db.collection('documents').doc(doc._id).remove()
            
            // 2. 删除云存储文件
            await wx.cloud.deleteFile({
              fileList: [doc.fileID]
            })
            
            wx.showToast({ title: '已删除' })
            this.loadDocuments()
          } catch (err) {
            console.error(err)
            wx.showToast({ title: '删除失败', icon: 'none' })
          } finally {
            wx.hideLoading()
          }
        }
      }
    })
  }
})
