const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// Stop words and synonyms for enhanced search
const STOP_WORDS = [
  '请问', '有没有', '有吗', '知道', '什么', '在哪里', '求', '想找', '的', '是', '啊', '吗', '呢', '了', 
  '吧', '呀', '么', '怎么', '如何', '能', '不能', '可以', '不可以', '帮我', '找', '一下', '告诉', 
  '我', '你', '他', '她', '它', '我们', '你们', '他们', '这个', '那个', '这些', '那些', '这里', '那里',
  '学校', '老师', '家长', // Contextual stop words
  '年', '月', '日', '号', // Date suffixes
  '有', '在', '看', '见', '去', '来', '上', '下', '里', '外' // Common verbs/prepositions
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

function extractKeywords(query) {
  let clean = String(query || '').trim()
  if (!clean) return []
  
  const keywords = []
  
  // 1. Extract years
  clean = clean.replace(/20\d{2}/g, (match) => {
    keywords.push(match)
    return ' '
  })

  // 2. Remove stop words
  const sortedStop = [...STOP_WORDS].sort((a, b) => b.length - a.length)
  sortedStop.forEach(w => {
    clean = clean.split(w).join(' ') 
  })
  
  // 3. Split by whitespace
  const parts = clean.split(/\s+/)
  
  parts.forEach(p => {
    const term = p.trim()
    if (term.length > 0) {
      keywords.push(term)
      // Add synonyms
      const lowerTerm = term.toLowerCase()
      if (SYNONYMS[lowerTerm]) {
        keywords.push(...SYNONYMS[lowerTerm])
      }
    }
  })
  
  const uniqueKeywords = [...new Set(keywords)]
  // Fallback: if no keywords found after cleaning (e.g. only stop words), use original query
  if (uniqueKeywords.length === 0 && query.trim()) {
    return [query.trim()]
  }
  return uniqueKeywords
}

function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const DEFAULT_AVATAR = '/images/default-avatar.png'
const BROKEN_URLS = [
  'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwBHdR33U7XkX7c9Xj7Z1i4h7hX7kX7c9Xj7Z1i4h7hX7kX7c9Xj7Z1i4h7/0',
  'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwBHJrFd5vfcptsJIS2eD9nlJ5ca8K78R8Uf8rD2QkR6v2j9b2q0a2a0a2a0a2a0a2a0a2a0a2a/0'
]

function buildDisplayName(student, siblings = []) {
  if (!student) return ''
  let name = student.englishName || student.chineseName || '家长'

  // Add siblings
  if (Array.isArray(siblings) && siblings.length > 0) {
    const siblingNames = siblings.map(s => {
      return s.englishName || s.chineseName || ''
    }).filter(n => n)
    
    if (siblingNames.length > 0) {
      name += ` & ${siblingNames.join(' & ')}`
    }
  }

  const relationRaw = String(student.relation || '').trim()
  const relation = relationRaw === '其他' ? String(student.relationOther || '').trim() : relationRaw
  const relationText = relation === '父亲' ? '爸爸' : (relation === '母亲' ? '妈妈' : relation)
  if (relationText) {
    name += ` ${relationText}`
  }
  return name
}

function needsAuthorAvatarFix(post) {
  const author = String(post.author || '')
  const avatar = String(post.avatar || '')
  if (!author || author === '家长') return true
  if (!avatar) return true
  if (avatar.startsWith('/')) return true
  if (BROKEN_URLS.includes(avatar)) return true
  return false
}

async function getTempUrlMap(fileIDs) {
  const uniq = Array.from(new Set(
    (fileIDs || [])
      .map(x => String(x || '').trim())
      .filter(x => x.startsWith('cloud://'))
  ))

  if (!uniq.length) return {}

  const map = {}
  const batchSize = 50
  for (let i = 0; i < uniq.length; i += batchSize) {
    const batch = uniq.slice(i, i + batchSize).map(fileID => ({ fileID, maxAge: 3600 }))
    const res = await cloud.getTempFileURL({ fileList: batch })
    for (const item of (res.fileList || [])) {
      if (item && item.fileID && item.tempFileURL) {
        map[item.fileID] = item.tempFileURL
      }
    }
  }
  return map
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const page = Number(event.page || 1) || 1
  const pageSize = Math.min(Number(event.pageSize || 20) || 20, 20)
  const category = String((event && event.category) || '').trim()
  const sort = String((event && event.sort) || 'latest').trim()
  const hasImages = Boolean(event && event.hasImages)
  const keyword = String((event && event.keyword) || '').trim()
  const id = String((event && event.id) || '').trim()
  const filter = String((event && event.filter) || '').trim()

  try {
    const whereClauses = [{ status: 'published' }]
    
    // Collected filter handling
    if (filter === 'collected') {
      const favoritesRes = await db.collection('favorites')
        .where({ openid: OPENID })
        .limit(1000)
        .get()
    
      const favorites = favoritesRes.data || []
      const targetPostIds = []
    
      favorites.forEach(f => {
        if (f.type === 'post' && f.targetId) {
          targetPostIds.push(f.targetId)
        } else if (f.type === 'comment' && f.postId) {
          targetPostIds.push(f.postId)
        }
      })
    
      const uniqueIds = [...new Set(targetPostIds)]
      if (uniqueIds.length === 0) {
        return { success: true, data: [] }
      }
    
      whereClauses.push({ _id: _.in(uniqueIds) })
    }

    if (id) whereClauses.push({ _id: id })
    if (category) whereClauses.push({ category })
    if (keyword) {
      // Use enhanced keyword extraction
      const keywords = extractKeywords(keyword)
      
      const orConditions = []
      
      // Build regex conditions for each keyword
      keywords.forEach(k => {
        const reg = db.RegExp({ regexp: escapeRegExp(k), options: 'i' })
        orConditions.push({ content: reg })
        orConditions.push({ author: reg })
      })

      // Also search comments with ANY of the keywords
      const commentConditions = keywords.map(k => ({
        content: db.RegExp({ regexp: escapeRegExp(k), options: 'i' })
      }))

      // Search comments
      const commentRes = await db.collection('post_comments')
        .where(_.and([
          { status: 'published' },
          _.or(commentConditions)
        ]))
        .limit(1000)
        .field({ postId: true })
        .get()
      
      const commentPostIds = (commentRes.data || [])
        .map(c => c.postId)
        .filter(id => id)
      const uniqueCommentPostIds = [...new Set(commentPostIds)]

      if (uniqueCommentPostIds.length > 0) {
        orConditions.push({
          _id: _.in(uniqueCommentPostIds)
        })
      }

      whereClauses.push(_.or(orConditions))
    }

    const baseQuery = db.collection('posts').where(_.and(whereClauses))

    let posts = []
    if (!hasImages) {
      let q = baseQuery
      if (sort === 'hot') {
        q = q.orderBy('likes', 'desc').orderBy('createTime', 'desc')
      } else {
        q = q.orderBy('createTime', 'desc')
      }
      const result = await q
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()
      posts = result.data || []
    } else {
      const needCount = page * pageSize
      const filtered = []
      const batchSize = 50
      let skip = 0

      for (let i = 0; i < 20 && filtered.length < needCount; i++) {
        let q = baseQuery
        if (sort === 'hot') {
          q = q.orderBy('likes', 'desc').orderBy('createTime', 'desc')
        } else {
          q = q.orderBy('createTime', 'desc')
        }

        const res = await q.skip(skip).limit(batchSize).get()
        const batch = res.data || []
        if (!batch.length) break
        skip += batch.length

        for (const p of batch) {
          if (p && Array.isArray(p.images) && p.images.length > 0) {
            filtered.push(p)
          }
        }
      }

      posts = filtered.slice((page - 1) * pageSize, page * pageSize)
    }

    const openids = Array.from(new Set(
      posts
        .map(p => p.openid || p._openid)
        .filter(Boolean)
    ))

    if (openids.length) {
      const appsRes = await db.collection('applications').where({ openid: _.in(openids) }).limit(100).get()
      const infoByOpenid = {}

      for (const application of (appsRes.data || [])) {
        infoByOpenid[application.openid] = {
          author: buildDisplayName(application.student, application.siblings),
          avatar: (application.profile && application.profile.avatarUrl) ? application.profile.avatarUrl : '',
          currentClass: (application.student && application.student.currentClass) ? application.student.currentClass : ''
        }
      }

      posts = posts.map(p => {
        const info = infoByOpenid[p.openid || p._openid]
        const next = { ...p }
        if (info) {
          // Always update author/avatar to latest if available, or at least attach currentClass
          if (info.author) next.author = info.author
          if (info.currentClass) next.authorCurrentClass = info.currentClass
          if (!next.avatar || String(next.avatar).startsWith('/') || BROKEN_URLS.includes(next.avatar)) {
            if (info.avatar && !BROKEN_URLS.includes(info.avatar)) next.avatar = info.avatar
          }
        }
        if (!next.avatar || String(next.avatar).startsWith('/') || BROKEN_URLS.includes(next.avatar)) {
          next.avatar = DEFAULT_AVATAR
        }
        return next
      })
    } else {
      posts = posts.map(p => {
        const next = { ...p }
        if (!next.avatar || String(next.avatar).startsWith('/') || BROKEN_URLS.includes(next.avatar)) {
          next.avatar = DEFAULT_AVATAR
        }
        return next
      })
    }

    const postIds = posts.map(p => p._id).filter(Boolean)
    if (postIds.length) {
      // 查询当前用户是否点赞
      const likesRes = await db.collection('post_likes').where({
        openid: OPENID,
        postId: _.in(postIds)
      }).limit(100).get()
      const likedSet = new Set((likesRes.data || []).map(x => x.postId))

      const favRes = await db.collection('favorites').where({
        openid: OPENID,
        type: 'post',
        targetId: _.in(postIds)
      }).limit(100).get()
      const collectedSet = new Set((favRes.data || []).map(x => x.targetId))
      
      // 如果有关键词，查询匹配的评论内容
      let matchingCommentsMap = {}
      if (keyword) {
        const matchedCommentsRes = await db.collection('post_comments')
          .where(_.and([
            { postId: _.in(postIds) },
            { status: 'published' },
            { content: db.RegExp({ regexp: keyword, options: 'i' }) }
          ]))
          .limit(100) // 每个页面最多显示100条匹配评论，足够了
          .field({ postId: true, content: true, author: true })
          .get()
        
        for (const c of (matchedCommentsRes.data || [])) {
          if (!matchingCommentsMap[c.postId]) {
            matchingCommentsMap[c.postId] = []
          }
          // 只要前2条匹配的评论，避免过多
          if (matchingCommentsMap[c.postId].length < 2) {
            matchingCommentsMap[c.postId].push({
              _id: c._id,
              author: c.author,
              content: c.content
            })
          }
        }
      }

      posts = posts.map(p => ({ 
        ...p, 
        likedByMe: likedSet.has(p._id),
        isCollected: collectedSet.has(p._id),
        matchComments: matchingCommentsMap[p._id] || []
      }))
    }

    const fileIDsToResolve = []
    for (const p of posts) {
      if (p && p.avatar) fileIDsToResolve.push(p.avatar)
      if (p && Array.isArray(p.images)) {
        for (const img of p.images) {
          fileIDsToResolve.push(img)
        }
      }
    }
    const urlMap = await getTempUrlMap(fileIDsToResolve)
    posts = posts.map(p => {
      const next = { ...p }
      if (next.avatar && urlMap[next.avatar]) {
        next.avatar = urlMap[next.avatar]
      }
      if (Array.isArray(next.images)) {
        next.images = next.images.map(img => urlMap[img] || img)
      }
      return next
    })

    return {
      success: true,
      data: posts
    }
  } catch (err) {
    console.error(err)
    return {
      success: false,
      errMsg: err.message
    }
  }
}
