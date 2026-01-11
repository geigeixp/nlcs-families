function buildYears() {
  const current = new Date().getFullYear()
  const years = []
  for (let y = current + 1; y >= current - 12; y--) {
    years.push(String(y))
  }
  return years
}

const app = getApp()

Page({
  data: {
    submitting: false,
    admissionYears: [],
    admissionYearIndex: -1,
    admissionYearDisplay: '请选择',
    entryGrades: ['Pre-KG', 'KG1', 'KG2', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12'],
    entryGradeIndex: -1,
    entryGradeDisplay: '请选择',
    relations: ['父亲', '母亲', '爷爷', '奶奶', '外公', '外婆', '监护人', '其他'],
    relationIndex: -1,
    relationDisplay: '请选择',
    englishName: '',
    chineseName: '',
    relationOther: '',
    letterImagePath: '',
    letterFileId: '',
    letterTempUrl: ''
  },

  onLoad() {
    const years = buildYears()
    this.setData({
      admissionYears: years
    })

    const existing = wx.getStorageSync('nlcs_application')
    if (existing && existing.student) {
      const yearIndex = years.findIndex(y => y === String(existing.student.admissionYear || ''))
      const gradeIndex = this.data.entryGrades.findIndex(g => g === String(existing.student.entryGradeAtEntry || ''))
      const relIndex = this.data.relations.findIndex(r => r === String(existing.student.relation || ''))
      this.setData({
        admissionYearIndex: yearIndex >= 0 ? yearIndex : -1,
        admissionYearDisplay: yearIndex >= 0 ? years[yearIndex] : '请选择',
        entryGradeIndex: gradeIndex >= 0 ? gradeIndex : -1,
        entryGradeDisplay: gradeIndex >= 0 ? this.data.entryGrades[gradeIndex] : '请选择',
        relationIndex: relIndex >= 0 ? relIndex : -1,
        relationDisplay: relIndex >= 0 ? this.data.relations[relIndex] : '请选择',
        englishName: existing.student.englishName || '',
        chineseName: existing.student.chineseName || '',
        relationOther: existing.student.relationOther || '',
        letterImagePath: existing.letterImagePath || '',
        letterFileId: existing.letterFileId || '',
        letterTempUrl: ''
      })
    }

    if (this.data.letterFileId) {
      this.refreshLetterTempUrl()
    }
  },

  onAdmissionYearChange(e) {
    const idx = Number(e.detail.value)
    this.setData({
      admissionYearIndex: idx,
      admissionYearDisplay: this.data.admissionYears[idx]
    })
  },

  onEntryGradeChange(e) {
    const idx = Number(e.detail.value)
    this.setData({
      entryGradeIndex: idx,
      entryGradeDisplay: this.data.entryGrades[idx]
    })
  },

  onRelationChange(e) {
    const idx = Number(e.detail.value)
    this.setData({
      relationIndex: idx,
      relationDisplay: this.data.relations[idx]
    })
  },

  onEnglishNameInput(e) {
    this.setData({
      englishName: e.detail.value
    })
  },

  onChineseNameInput(e) {
    this.setData({
      chineseName: e.detail.value
    })
  },

  onRelationOtherInput(e) {
    this.setData({
      relationOther: e.detail.value
    })
  },

  refreshLetterTempUrl() {
    const fileID = this.data.letterFileId
    if (!fileID || !wx.cloud) return
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: (res) => {
        const item = res.fileList && res.fileList[0]
        if (item && item.tempFileURL) {
          this.setData({
            letterTempUrl: item.tempFileURL
          })
        }
      }
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

  chooseLetter() {
    if (!wx.cloud) {
      wx.showToast({ title: '请先开通云开发', icon: 'none' })
      return
    }
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const temp = res.tempFilePaths && res.tempFilePaths[0]
        if (!temp) return
        const cloudPath = `admission_letters/${Date.now()}_${Math.random().toString(16).slice(2)}.jpg`
        wx.showLoading({ title: '上传中...' })
        
        try {
          const uploadRes = await this.uploadWithRetry(cloudPath, temp)
          this.setData({
            letterImagePath: temp,
            letterFileId: uploadRes.fileID,
            letterTempUrl: ''
          })
          wx.hideLoading()
          this.refreshLetterTempUrl()
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: '上传失败', icon: 'none' })
        }
      }
    })
  },

  previewLetter() {
    const url = this.data.letterTempUrl || this.data.letterImagePath
    if (!url) return
    wx.previewImage({
      current: url,
      urls: [url]
    })
  },

  removeLetter() {
    this.setData({
      letterImagePath: '',
      letterFileId: '',
      letterTempUrl: ''
    })
  },

  submit() {
    const admissionYear = this.data.admissionYearDisplay === '请选择' ? '' : this.data.admissionYearDisplay
    const entryGradeAtEntry = this.data.entryGradeDisplay === '请选择' ? '' : this.data.entryGradeDisplay
    const englishName = String(this.data.englishName || '').trim()
    const chineseName = String(this.data.chineseName || '').trim()
    const relation = this.data.relationDisplay === '请选择' ? '' : this.data.relationDisplay
    const relationOther = String(this.data.relationOther || '').trim()
    const letterFileId = this.data.letterFileId

    if (!admissionYear) {
      wx.showToast({ title: '请选择入学年份', icon: 'none' })
      return
    }
    if (!entryGradeAtEntry) {
      wx.showToast({ title: '请选择入学时年级', icon: 'none' })
      return
    }
    if (!englishName) {
      wx.showToast({ title: '请填写英文名', icon: 'none' })
      return
    }
    if (!relation) {
      wx.showToast({ title: '请选择与学生关系', icon: 'none' })
      return
    }
    if (relation === '其他' && !relationOther) {
      wx.showToast({ title: '请补充关系信息', icon: 'none' })
      return
    }
    if (!letterFileId) {
      wx.showToast({ title: '请上传入学通知书截图', icon: 'none' })
      return
    }
    const invite = wx.getStorageSync('nlcs_invite') || ''

    this.setData({ submitting: true })
    if (!wx.cloud) {
      this.setData({ submitting: false })
      wx.showToast({ title: '请先开通云开发', icon: 'none' })
      return
    }

    wx.cloud.callFunction({
      name: 'submitApplication',
      data: {
        admissionYear,
        entryGradeAtEntry,
        englishName,
        chineseName,
        relation,
        relationOther,
        letterFileId,
        invite
      }
    })
      .then((res) => {
        const result = res && res.result ? res.result : {}
        if (!result.ok) {
          wx.showToast({ 
            title: '提交失败: ' + (result.message || '未知原因'), 
            icon: 'none',
            duration: 3000
          })
          return
        }
        if (result.application) {
          wx.setStorageSync('nlcs_application', result.application)
        }
        return app.refreshSession()
      })
      .then(() => {
        wx.showToast({ title: '已提交审核', icon: 'success' })
        wx.redirectTo({ url: '/pages/status/status' })
      })
      .catch((err) => {
        console.error('提交失败:', err)
        wx.showToast({ 
          title: '错误: ' + (err.message || err.errMsg || '提交失败'), 
          icon: 'none',
          duration: 3000
        })
      })
      .finally(() => {
        this.setData({ submitting: false })
      })
  },

  goStatus() {
    wx.redirectTo({
      url: '/pages/status/status'
    })
  }
})
