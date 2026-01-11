const app = getApp()

function buildYears() {
  const current = new Date().getFullYear()
  const years = []
  for (let y = current + 1; y >= current - 12; y--) {
    years.push(String(y))
  }
  return years
}

Page({
  data: {
    keyword: '',
    admissionYears: [],
    selectedYear: '',
    entryGrades: ['Pre-KG', 'KG1', 'KG2', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12'],
    selectedGrade: '',
    currentClass: '',
    showClassInput: false,
    tempClassInput: '',
    
    students: [],
    page: 1,
    loading: false,
    hasMore: true,
    isRefreshing: false,
    hasSearched: false,
    isApproved: false, // New state
    
    // Author Modal
    showAuthorModal: false,
    authorInfo: {}
  },

  onLoad() {
    this.setData({
      admissionYears: buildYears()
    })
    // Do not load data initially
  },
  
  onShow() {
      // Optional: refresh if needed, but might be annoying if list resets
      app.refreshSession().finally(() => {
          this.checkApproved()
      })
  },

  checkApproved() {
      const application = wx.getStorageSync('nlcs_application')
      const isApproved = application && application.status === 'approved'
      this.setData({ isApproved })
      if (!isApproved) {
          this.setData({ students: [], hasSearched: false })
      }
  },

  goStatus() {
      wx.navigateTo({ url: '/pages/status/status' })
  },

  loadData(reset = false) {
    if (!this.data.isApproved) return;
    if (this.data.loading && !reset) return
    if (reset) {
      this.setData({ page: 1, hasMore: true, students: [], hasSearched: true })
    }
    if (!this.data.hasMore && !reset) return

    this.setData({ loading: true })

    wx.cloud.callFunction({
      name: 'getAlumni',
      data: {
        page: reset ? 1 : this.data.page,
        keyword: this.data.keyword,
        year: this.data.selectedYear,
        grade: this.data.selectedGrade,
        class: this.data.currentClass
      }
    }).then(res => {
      const result = res.result
      if (result && result.ok) {
        const newStudents = result.list || []
        this.setData({
          students: reset ? newStudents : this.data.students.concat(newStudents),
          page: (reset ? 1 : this.data.page) + 1,
          hasMore: newStudents.length >= 20, // pageSize is 20
          loading: false,
          isRefreshing: false
        })
      } else {
        this.setData({ loading: false, isRefreshing: false })
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    }).catch(err => {
      console.error(err)
      this.setData({ loading: false, isRefreshing: false })
      wx.showToast({ title: '网络错误', icon: 'none' })
    })
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch() {
    this.loadData(true)
  },
  
  clearSearch() {
      this.setData({ keyword: '' })
      // Do not reload immediately if you want manual trigger, 
      // but usually clearing search means reset. 
      // User asked for "Reset Filters" button, so maybe clearSearch just clears text.
      // But typical UI: clear text -> wait for new search or manual search.
      // Keeping existing behavior but just clearing text.
  },
  
  resetFilters() {
      this.setData({
          keyword: '',
          selectedYear: '',
          selectedGrade: '',
          currentClass: '',
          students: [],
          hasSearched: false,
          page: 1,
          hasMore: true
      })
  },

  onYearChange(e) {
    const idx = Number(e.detail.value)
    this.setData({
      selectedYear: this.data.admissionYears[idx]
    })
    this.loadData(true)
  },

  onGradeChange(e) {
    const idx = Number(e.detail.value)
    this.setData({
      selectedGrade: this.data.entryGrades[idx]
    })
    this.loadData(true)
  },
  
  showClassInputModal() {
      this.setData({ 
          showClassInput: true,
          tempClassInput: this.data.currentClass 
      })
  },
  
  hideClassInputModal() {
      this.setData({ showClassInput: false })
  },
  
  onTempClassInput(e) {
      this.setData({ tempClassInput: e.detail.value })
  },
  
  onClassConfirm() {
      this.setData({
          currentClass: this.data.tempClassInput,
          showClassInput: false
      })
      this.loadData(true)
  },

  onReachBottom() {
    this.loadData()
  },

  onRefresh() {
    this.setData({ isRefreshing: true })
    this.loadData(true)
  },
  
  viewProfile(e) {
      const openid = e.currentTarget.dataset.openid
      const nickName = e.currentTarget.dataset.nickname || '家长'
      const avatar = e.currentTarget.dataset.avatar || '/images/default-avatar.png'
      
      if (!openid) return
      
      this.setData({
          showAuthorModal: true,
          authorInfo: {
              nickName,
              avatarUrl: avatar,
              loading: true
          }
      })
      
      wx.showLoading({ title: '加载中' })
      wx.cloud.callFunction({
          name: 'getPublicProfile',
          data: { openid: openid }
      }).then(res => {
          wx.hideLoading()
          if (res.result && res.result.ok) {
              this.setData({
                  authorInfo: {
                      ...this.data.authorInfo,
                      ...res.result.data,
                      loading: false
                  }
              })
          } else {
              wx.showToast({ title: '获取信息失败', icon: 'none' })
          }
      }).catch(err => {
          wx.hideLoading()
          console.error(err)
          wx.showToast({ title: '网络错误', icon: 'none' })
      })
  },
  
  closeAuthorModal() {
      this.setData({ showAuthorModal: false })
  }
})