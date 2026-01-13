const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

const formatTime = date => {
  if (!date) return ''
  
  // Handle cloud function date format (ISO string or Date object)
  if (typeof date === 'string') {
    date = new Date(date)
  }
  
  // Check if valid date
  if (isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()

  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute].map(formatNumber).join(':')}`
}

const formatTimeAgo = date => {
  if (!date) return ''
  if (typeof date === 'string') {
    date = new Date(date)
  }
  if (isNaN(date.getTime())) return ''

  const now = new Date()
  const diff = (now - date) / 1000 // seconds

  if (diff < 60) {
    return '刚刚'
  } else if (diff < 3600) {
    return `${Math.floor(diff / 60)}分钟前`
  } else if (diff < 86400) {
    return `${Math.floor(diff / 3600)}小时前`
  } else if (diff < 2592000) { // 30 days
    return `${Math.floor(diff / 86400)}天前`
  } else {
    return formatTime(date)
  }
}

/**
 * 为微信云存储图片添加缩略图参数
 * @param {string} url - 原始图片URL
 * @param {object} options - 压缩选项
 * @param {number} options.width - 目标宽度（默认：400）
 * @param {number} options.quality - 图片质量 1-100（默认：80）
 * @returns {string} 压缩后的图片URL
 */
const getCompressedImageUrl = (url, options = {}) => {
  if (!url || typeof url !== 'string') return url

  // 只处理微信云存储的图片
  if (!url.startsWith('cloud://') && !url.includes('tcb.qcloud.la')) {
    return url
  }

  const { width = 400, quality = 80 } = options

  // 微信云存储图片处理参数
  // imageMogr2/thumbnail/<width>x/quality/<quality>/format/webp
  const params = `imageMogr2/thumbnail/${width}x/quality/${quality}/format/webp`

  // 如果URL中已经有参数，需要正确拼接
  if (url.includes('?')) {
    return `${url}&${params}`
  } else {
    return `${url}?${params}`
  }
}

module.exports = {
  formatTime,
  formatTimeAgo,
  getCompressedImageUrl
}
