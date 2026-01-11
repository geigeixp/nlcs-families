const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function buildDisplayName(student) {
  if (!student) return ''
  let name = student.englishName || '家长'
  if (student.chineseName) {
    name += ` (${student.chineseName})`
  }
  const relationRaw = String(student.relation || '').trim()
  const relation = relationRaw === '其他' ? String(student.relationOther || '').trim() : relationRaw
  const relationText = relation === '父亲' ? '爸爸' : (relation === '母亲' ? '妈妈' : relation)
  if (relationText) {
    name += ` ${relationText}`
  }
  return name
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const page = Number(event.page || 1) || 1
  const pageSize = Math.min(Number(event.pageSize || 20) || 20, 50)

  try {
    // 1. 获取我发布的所有帖子ID (为了后续查询针对这些帖子的互动)
    // 考虑到性能，只获取ID和少量预览信息
    // 如果帖子非常多，这里可能需要分批，但对于个人发布通常几百条是极限，一次取1000条ID应该没问题
    const myPostsRes = await db.collection('posts')
      .where(_.or([
        { openid: OPENID },
        { _openid: OPENID }
      ]))
      .field({
        _id: true,
        content: true,
        images: true,
        status: true
      })
      .limit(1000)
      .get()
    
    const myPosts = myPostsRes.data || []
    if (myPosts.length === 0) {
      return { ok: true, list: [], hasMore: false }
    }

    const postMap = {}
    const postIds = []
    for (const p of myPosts) {
      // 只有已发布的帖子才展示互动，或者所有状态？通常已发布。
      // 但这里为了不漏掉信息，只要是我的帖子都算
      postIds.push(p._id)
      postMap[p._id] = {
        content: p.content || '',
        image: (p.images && p.images.length > 0) ? p.images[0] : ''
      }
    }

    // 2. 并行查询评论和点赞
    // 策略：为了简化，取最近的 (page * pageSize) * 2 条，然后在内存中合并排序
    // 这样能保证前几页数据的准确性。对于非常久远的历史数据，这种方式可能会有性能瓶颈，但对当前规模适用。
    const fetchLimit = page * pageSize + 20 // 多取一点

    const [commentsRes, likesRes] = await Promise.all([
      db.collection('post_comments')
        .where({
          postId: _.in(postIds),
          openid: _.neq(OPENID), // 排除自己给自己的
          status: 'published'
        })
        .orderBy('createdAt', 'desc')
        .limit(fetchLimit)
        .get(),
      db.collection('post_likes')
        .where({
          postId: _.in(postIds),
          openid: _.neq(OPENID) // 排除自己给自己点赞
        })
        .orderBy('createdAt', 'desc')
        .limit(fetchLimit)
        .get()
    ])

    // 3. 统一格式化
    const messages = []

    // 处理评论
    for (const c of (commentsRes.data || [])) {
      messages.push({
        type: 'comment',
        _id: c._id, // 唯一标识
        postId: c.postId,
        actionOpenid: c.openid || c._openid,
        author: c.author, // 评论表里有 author
        avatar: c.avatar, // 评论表里有 avatar
        content: c.content,
        createdAt: new Date(c.createdAt).getTime(),
        postPreview: postMap[c.postId] || {}
      })
    }

    // 处理点赞 (点赞表里没有 author/avatar，需要聚合查询)
    const likeItems = likesRes.data || []
    const likeOpenids = new Set()
    for (const l of likeItems) {
      likeOpenids.add(l.openid || l._openid)
    }

    // 获取点赞者的用户信息
    const userMap = {}
    if (likeOpenids.size > 0) {
      const usersRes = await db.collection('applications')
        .where({
          openid: _.in(Array.from(likeOpenids))
        })
        .limit(100) // 假设点赞人去重后不超过100个
        .get()
      
      for (const u of (usersRes.data || [])) {
        userMap[u.openid] = {
          author: buildDisplayName(u.student),
          avatar: (u.profile && u.profile.avatarUrl) ? u.profile.avatarUrl : ''
        }
      }
    }

    for (const l of likeItems) {
      const oid = l.openid || l._openid
      const userInfo = userMap[oid] || { author: '用户', avatar: '' }
      messages.push({
        type: 'like',
        _id: l._id,
        postId: l.postId,
        actionOpenid: oid,
        author: userInfo.author,
        avatar: userInfo.avatar,
        content: '', // 点赞没有内容
        createdAt: new Date(l.createdAt).getTime(),
        postPreview: postMap[l.postId] || {}
      })
    }

    // 4. 排序和分页
    messages.sort((a, b) => b.createdAt - a.createdAt)

    const start = (page - 1) * pageSize
    const pagedMessages = messages.slice(start, start + pageSize)

    // 5. 格式化时间
    // 在云函数里做简单格式化，或者返回时间戳前端处理。为了统一，返回时间戳。

    return {
      ok: true,
      list: pagedMessages,
      hasMore: messages.length > start + pageSize
    }

  } catch (err) {
    console.error(err)
    return { ok: false, message: err.message }
  }
}
