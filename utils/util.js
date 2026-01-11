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

module.exports = {
  formatTime,
  formatTimeAgo
}
