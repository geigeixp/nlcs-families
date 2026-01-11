function buildYears() {
  const current = new Date().getFullYear()
  const years = []
  for (let y = current + 1; y >= current - 12; y--) {
    years.push(String(y))
  }
  return years
}

const DEFAULT_SIBLING_FORM = {
  englishName: '',
  chineseName: '',
  admissionYear: '',
  admissionYearIndex: -1,
  entryGradeAtEntry: '',
  entryGradeIndex: -1,
  currentClass: ''
}

Page({
  data: {
    student: null,
    avatar: '',
    englishName: '', // New editable field
    chineseName: '', // New editable field
    currentClass: '',
    siblings: [], // Array of sibling objects
    
    // Primary student picker data
    admissionYears: [],
    admissionYearIndex: -1,
    admissionYearDisplay: '请选择',
    entryGrades: ['Pre-KG', 'KG1', 'KG2', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12'],
    entryGradeIndex: -1,
    entryGradeDisplay: '请选择',

    // Sibling Modal State
    showSiblingModal: false,
    editingSiblingIndex: -1, // -1 for add, >=0 for edit
    siblingForm: { ...DEFAULT_SIBLING_FORM }
  },

  onLoad() {
    const years = buildYears()
    this.setData({ admissionYears: years })

    const application = wx.getStorageSync('nlcs_application')
    if (application && application.student) {
      const yearIndex = years.findIndex(y => y === String(application.student.admissionYear || ''))
      const gradeIndex = this.data.entryGrades.findIndex(g => g === String(application.student.entryGradeAtEntry || ''))

      this.setData({
        student: application.student,
        avatar: application.student.avatar || '',
        englishName: application.student.englishName || '',
        chineseName: application.student.chineseName || '',
        currentClass: application.student.currentClass || '',
        admissionYearIndex: yearIndex >= 0 ? yearIndex : -1,
        admissionYearDisplay: yearIndex >= 0 ? years[yearIndex] : (application.student.admissionYear || '请选择'),
        entryGradeIndex: gradeIndex >= 0 ? gradeIndex : -1,
        entryGradeDisplay: gradeIndex >= 0 ? this.data.entryGrades[gradeIndex] : (application.student.entryGradeAtEntry || '请选择'),
        siblings: application.siblings || []
      })
    }
  },

  onEnglishNameInput(e) {
    this.setData({ englishName: e.detail.value })
  },

  onChineseNameInput(e) {
    this.setData({ chineseName: e.detail.value })
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

  // Sibling Management Methods
  addSibling() {
    this.setData({
      showSiblingModal: true,
      editingSiblingIndex: -1,
      siblingForm: { ...DEFAULT_SIBLING_FORM }
    })
  },

  editSibling(e) {
    const index = e.currentTarget.dataset.index
    const sibling = this.data.siblings[index]
    const yearIndex = this.data.admissionYears.findIndex(y => y === String(sibling.admissionYear || ''))
    const gradeIndex = this.data.entryGrades.findIndex(g => g === String(sibling.entryGradeAtEntry || ''))

    this.setData({
      showSiblingModal: true,
      editingSiblingIndex: index,
      siblingForm: {
        englishName: sibling.englishName,
        chineseName: sibling.chineseName || '',
        admissionYear: sibling.admissionYear,
        admissionYearIndex: yearIndex >= 0 ? yearIndex : -1,
        entryGradeAtEntry: sibling.entryGradeAtEntry,
        entryGradeIndex: gradeIndex >= 0 ? gradeIndex : -1,
        currentClass: sibling.currentClass || ''
      }
    })
  },

  showClassHelp() {
    wx.showModal({
      title: '班级填写说明',
      content: '新生未分班请填写‘新生’，老生填写完整班级名（如 7A），已离校填写‘已离校’',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  deleteSibling(e) {
    const index = e.currentTarget.dataset.index
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个孩子的信息吗？',
      success: (res) => {
        if (res.confirm) {
          const siblings = [...this.data.siblings]
          siblings.splice(index, 1)
          this.setData({ siblings })
        }
      }
    })
  },

  closeSiblingModal() {
    this.setData({ showSiblingModal: false })
  },

  onSiblingInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`siblingForm.${field}`]: value
    })
  },

  onSiblingYearChange(e) {
    const idx = Number(e.detail.value)
    const year = this.data.admissionYears[idx]
    this.setData({
      'siblingForm.admissionYearIndex': idx,
      'siblingForm.admissionYear': year
    })
  },

  onSiblingGradeChange(e) {
    const idx = Number(e.detail.value)
    const grade = this.data.entryGrades[idx]
    this.setData({
      'siblingForm.entryGradeIndex': idx,
      'siblingForm.entryGradeAtEntry': grade
    })
  },

  confirmSibling() {
    const { englishName, admissionYear, entryGradeAtEntry } = this.data.siblingForm
    
    if (!englishName.trim()) {
      wx.showToast({ title: '请填写英文名', icon: 'none' })
      return
    }

    const newSibling = {
      englishName: englishName.trim(),
      chineseName: this.data.siblingForm.chineseName.trim(),
      admissionYear,
      entryGradeAtEntry,
      currentClass: this.data.siblingForm.currentClass.trim()
    }

    const siblings = [...this.data.siblings]
    if (this.data.editingSiblingIndex >= 0) {
      siblings[this.data.editingSiblingIndex] = newSibling
    } else {
      siblings.push(newSibling)
    }

    this.setData({
      siblings,
      showSiblingModal: false
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

  onChooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        wx.showLoading({ title: '上传中' })
        
        try {
          const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).slice(-6)}.jpg`
          const uploadRes = await this.uploadWithRetry(cloudPath, tempFilePath)
          
          this.setData({ avatar: uploadRes.fileID })
          wx.hideLoading()
        } catch (err) {
          console.error(err)
          wx.hideLoading()
          wx.showToast({ title: '上传失败', icon: 'none' })
        }
      }
    })
  },

  onCurrentClassInput(e) {
    this.setData({ currentClass: e.detail.value })
  },

  showClassHelp() {
    wx.showModal({
      title: '班级填写说明',
      content: '新生未分班请填写‘新生’，老生填写完整班级名（如 7A），已离校填写‘已离校’',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  saveInfo() {
    if (!this.data.englishName.trim()) {
      wx.showToast({ title: '请填写英文名', icon: 'none' })
      return
    }

    const admissionYear = this.data.admissionYearIndex >= 0 ? this.data.admissionYears[this.data.admissionYearIndex] : this.data.student.admissionYear
    const entryGradeAtEntry = this.data.entryGradeIndex >= 0 ? this.data.entryGrades[this.data.entryGradeIndex] : this.data.student.entryGradeAtEntry

    wx.showLoading({ title: '保存中' })
    wx.cloud.callFunction({
      name: 'updateStudentInfo',
      data: {
        avatar: this.data.avatar,
        englishName: this.data.englishName.trim(),
        chineseName: this.data.chineseName.trim(),
        currentClass: this.data.currentClass,
        admissionYear,
        entryGradeAtEntry,
        siblings: this.data.siblings
      }
    }).then(res => {
      wx.hideLoading()
      if (res.result.ok) {
        // Update local storage
        const appData = wx.getStorageSync('nlcs_application') || {}
        if (appData.student) {
          appData.student.avatar = this.data.avatar
          appData.student.englishName = this.data.englishName.trim()
          appData.student.chineseName = this.data.chineseName.trim()
          appData.student.currentClass = this.data.currentClass
          appData.student.admissionYear = admissionYear
          appData.student.entryGradeAtEntry = entryGradeAtEntry
        }
        appData.siblings = this.data.siblings
        wx.setStorageSync('nlcs_application', appData)
        
        wx.showToast({ title: '保存成功' })
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' })
      }
    }).catch(err => {
      console.error(err)
      wx.hideLoading()
      wx.showToast({ title: '网络错误', icon: 'none' })
    })
  }
})