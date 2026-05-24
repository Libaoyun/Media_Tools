<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const inputUrl = ref('')
const isParsing = ref(false)
const errorMsg = ref('')
const parseResult = ref(null)
const parseDuration = ref(0) // 解析用时记录
const activeTab = ref('video') // 'video' | 'copywriting' | 'summary'

// 豆包 API 配置存储
const showSettings = ref(false)
const doubaoApiKey = ref(localStorage.getItem('doubaoApiKey') || '')
const doubaoEndpointId = ref(localStorage.getItem('doubaoEndpointId') || '')
const enableDoubao = ref(localStorage.getItem('enableDoubao') === 'true' || !!localStorage.getItem('doubaoApiKey'))

// ASR 语音识别配置存储
const asrApiKey = ref(localStorage.getItem('asrApiKey') || 'sk-zxvocsyeqoligfhfnkabtdblpfhvnrpznrfofxgvgvubpkxp')
const asrEndpoint = ref(localStorage.getItem('asrEndpoint') || 'https://api.siliconflow.cn/v1')
const asrModel = ref(localStorage.getItem('asrModel') || 'FunAudioLLM/SenseVoiceSmall')
const enableAsr = ref(localStorage.getItem('enableAsr') !== 'false')

// AI 核心总结大模型配置存储
const summaryProvider = ref(localStorage.getItem('summaryProvider') || 'siliconflow') // 'siliconflow' | 'doubao'
const siliconflowLlApiKey = ref(localStorage.getItem('siliconflowLlApiKey') || '')
const siliconflowLlModel = ref(localStorage.getItem('siliconflowLlModel') || 'Qwen/Qwen2.5-7B-Instruct')

// 设置访问密码验证状态
const showPasswordModal = ref(false)
const settingsPassword = ref('')
const passwordErrorMsg = ref('')

// ==================== 登录、账户管理与操作审计状态 ====================
const token = ref(localStorage.getItem('authToken') || '')
const tokenExpireAt = ref(localStorage.getItem('authTokenExpireAt') || '')
const currentUser = ref(null)
const currentPage = ref('main') // 'main' | 'settings' | 'profile' | 'admin' | 'auth'

// 登录与注册表单
const showAuthModal = ref(true)
const authTab = ref('login') // 'login' | 'register'
const loginUsername = ref('')
const loginPassword = ref('')
const regUsername = ref('')
const regPassword = ref('')
const regNickname = ref('')

// 个人资料修改
const showProfileDropdown = ref(false)
const editNickname = ref('')
const editPassword = ref('')
const editAvatarSeed = ref('')

// 管理员后台面板
const showAdminDashboard = ref(false)
const adminTab = ref('users') // 'users' | 'logs'
const adminUsers = ref([])
const adminLogs = ref([])

// 新增用户表单 (管理员创建账号使用)
const showCreateUserForm = ref(false)
const createUsername = ref('')
const createPassword = ref('')
const createNickname = ref('')
const createRole = ref('user')

// 外网访问密钥配置
const showAccessKeyModal = ref(false)
const tempAccessKey = ref('')
const accessKey = ref(sessionStorage.getItem('accessKey') || '')

// ==================== 登录、账户管理与审计接口调用 ====================

// 封装带 Token 自动验证的 fetch 请求
const fetchWithAuth = async (url, options = {}) => {
  if (!options.headers) {
    options.headers = {}
  }
  if (token.value) {
    options.headers['Authorization'] = `Bearer ${token.value}`
  }
  
  try {
    const res = await fetch(url, options)
    if (res.status === 401) {
      handleLogout()
      showToast('登录会话已失效，请重新登录！', 'error')
      throw new Error('UNAUTHORIZED')
    }
    return res
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') {
      console.error('API 请求失败:', err)
    }
    throw err
  }
}

// 用户登录
const handleLogin = async () => {
  if (!loginUsername.value.trim() || !loginPassword.value.trim()) {
    showToast('请输入用户名和密码！', 'error')
    return
  }
  try {
    const res = await fetch(`${ENGINE_API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: loginUsername.value.trim(),
        password: loginPassword.value.trim()
      })
    })
    const data = await res.json()
    if (res.ok && data.success) {
      token.value = data.token
      tokenExpireAt.value = data.expireAt.toString()
      localStorage.setItem('authToken', data.token)
      localStorage.setItem('authTokenExpireAt', data.expireAt.toString())
      currentUser.value = data.user
      currentPage.value = 'main'
      showToast(`欢迎回来，${data.user.nickname || data.user.username}！`, 'success')
      loginPassword.value = ''
    } else {
      showToast(data.message || '登录失败，请检查账号密码！', 'error')
    }
  } catch (err) {
    showToast('网络连接失败，请确保本地后端已启动！', 'error')
  }
}

// 普通用户注册
const handleRegister = async () => {
  if (!regUsername.value.trim() || !regPassword.value.trim()) {
    showToast('用户名和密码不能为空！', 'error')
    return
  }
  if (regUsername.value.trim().length < 3) {
    showToast('用户名长度至少为3位！', 'error')
    return
  }
  try {
    const res = await fetch(`${ENGINE_API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: regUsername.value.trim(),
        password: regPassword.value.trim(),
        nickname: regNickname.value.trim()
      })
    })
    const data = await res.json()
    if (res.ok && data.success) {
      showToast(data.message || '注册成功！请登录。', 'success')
      authTab.value = 'login'
      loginUsername.value = regUsername.value
      regUsername.value = ''
      regPassword.value = ''
      regNickname.value = ''
    } else {
      showToast(data.message || '注册失败，该用户名可能已被占用！', 'error')
    }
  } catch (err) {
    showToast('注册接口请求失败！', 'error')
  }
}

// 退出登录
const handleLogout = () => {
  token.value = ''
  tokenExpireAt.value = ''
  localStorage.removeItem('authToken')
  localStorage.removeItem('authTokenExpireAt')
  currentUser.value = null
  currentPage.value = 'auth'
  showProfileDropdown.value = false
  parseResult.value = null
  errorMsg.value = ''
}

// 校验登录态
const checkAuthSession = async () => {
  if (!token.value) {
    currentPage.value = 'auth'
    return
  }
  if (tokenExpireAt.value && Date.now() > parseInt(tokenExpireAt.value)) {
    handleLogout()
    showToast('您的登录已过期，请重新登录！', 'warning')
    return
  }

  try {
    const res = await fetch(`${ENGINE_API_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token.value}` }
    })
    const data = await res.json()
    if (res.ok && data.success) {
      currentUser.value = data.user
      currentPage.value = 'main'
    } else {
      handleLogout()
    }
  } catch (e) {
    console.error('会话校验错误:', e)
    currentPage.value = currentUser.value ? 'main' : 'auth'
  }
}

// 开启编辑个人资料
const openEditProfile = () => {
  if (!currentUser.value) return
  editNickname.value = currentUser.value.nickname
  editPassword.value = ''
  editAvatarSeed.value = currentUser.value.username
  currentPage.value = 'profile'
  showProfileDropdown.value = false
}

// 更新个人资料
const handleProfileUpdate = async () => {
  if (!editNickname.value.trim()) {
    showToast('昵称不能为空！', 'error')
    return
  }
  
  const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(editAvatarSeed.value.trim() || currentUser.value.username)}`
  
  try {
    const res = await fetchWithAuth(`${ENGINE_API_URL}/api/auth/profile/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nickname: editNickname.value.trim(),
        avatar: avatarUrl,
        password: editPassword.value.trim() || undefined
      })
    })
    const data = await res.json()
    if (res.ok && data.success) {
      currentUser.value.nickname = data.user.nickname
      currentUser.value.avatar = data.user.avatar
      currentPage.value = 'main'
      showToast('个人资料更新成功！', 'success')
    } else {
      showToast(data.message || '更新失败！', 'error')
    }
  } catch (e) {
    showToast('更新失败，网络接口错误！', 'error')
  }
}

// 获取系统用户列表 (Admin 权限)
const fetchAdminUsers = async () => {
  try {
    const res = await fetchWithAuth(`${ENGINE_API_URL}/api/admin/users`)
    const data = await res.json()
    if (res.ok && data.success) {
      adminUsers.value = data.users
    }
  } catch (e) {
    showToast('获取账号列表失败！', 'error')
  }
}

// 获取系统审计日志 (Admin 权限)
const fetchAdminLogs = async () => {
  try {
    const res = await fetchWithAuth(`${ENGINE_API_URL}/api/admin/logs`)
    const data = await res.json()
    if (res.ok && data.success) {
      adminLogs.value = data.logs
    }
  } catch (e) {
    showToast('获取审计日志失败！', 'error')
  }
}

// 开启管理员后台
const openAdminDashboard = async () => {
  showProfileDropdown.value = false
  adminTab.value = 'users'
  showCreateUserForm.value = false
  currentPage.value = 'admin'
  await fetchAdminUsers()
  await fetchAdminLogs()
}

// 管理员创建账号
const handleCreateUser = async () => {
  if (!createUsername.value.trim() || !createPassword.value.trim()) {
    showToast('用户名和密码不能为空！', 'error')
    return
  }
  try {
    const res = await fetchWithAuth(`${ENGINE_API_URL}/api/admin/users/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: createUsername.value.trim(),
        password: createPassword.value.trim(),
        nickname: createNickname.value.trim() || createUsername.value.trim(),
        role: createRole.value
      })
    })
    const data = await res.json()
    if (res.ok && data.success) {
      showToast('账号创建成功！', 'success')
      createUsername.value = ''
      createPassword.value = ''
      createNickname.value = ''
      createRole.value = 'user'
      showCreateUserForm.value = false
      await fetchAdminUsers()
    } else {
      showToast(data.message || '创建账号失败！', 'error')
    }
  } catch (e) {
    showToast('创建账号接口错误！', 'error')
  }
}

// 管理员删除账号
const handleDeleteUser = async (username) => {
  if (!confirm(`确认要永久删除账号 "${username}" 吗？此操作不可逆！`)) {
    return
  }
  try {
    const res = await fetchWithAuth(`${ENGINE_API_URL}/api/admin/users/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    })
    const data = await res.json()
    if (res.ok && data.success) {
      showToast('账号删除成功！', 'success')
      await fetchAdminUsers()
    } else {
      showToast(data.message || '删除账号失败！', 'error')
    }
  } catch (e) {
    showToast('删除账号接口错误！', 'error')
  }
}

const formatDate = (isoStr) => {
  if (!isoStr) return '-'
  try {
    const d = new Date(isoStr)
    const pad = (n) => n.toString().padStart(2, '0')
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch (e) {
    return isoStr
  }
}

// Canvas 粒子背景引用
const canvasRef = ref(null)
let animationId = null

// 关闭头像下拉菜单的全局监听
const closeDropdown = () => {
  showProfileDropdown.value = false
}

// 初始化 Canvas 交互星空粒子网格
onMounted(() => {
  checkAuthSession()
  window.addEventListener('click', closeDropdown)
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  let width = canvas.width = window.innerWidth
  let height = canvas.height = window.innerHeight

  const handleResize = () => {
    if (!canvas) return
    width = canvas.width = window.innerWidth
    height = canvas.height = window.innerHeight
  }
  window.addEventListener('resize', handleResize)

  // 粒子配置
  const particles = []
  const particleCount = 75
  const connectionDistance = 110
  const mouse = { x: null, y: null, radius: 120 }

  const handleMouseMove = (e) => {
    mouse.x = e.clientX
    mouse.y = e.clientY
  }

  const handleMouseLeave = () => {
    mouse.x = null
    mouse.y = null
  }

  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseleave', handleMouseLeave)

  class Particle {
    constructor() {
      this.reset()
      // 初始分布遍布全屏
      this.x = Math.random() * width
      this.y = Math.random() * height
    }

    reset() {
      this.x = Math.random() * width
      this.y = Math.random() * height
      this.vx = (Math.random() - 0.5) * 0.4
      this.vy = (Math.random() - 0.5) * 0.4
      this.radius = Math.random() * 2 + 1
      this.color = Math.random() > 0.45 ? '#8b5cf6' : '#d946ef'
      this.alpha = Math.random() * 0.5 + 0.25
    }

    update() {
      this.x += this.vx
      this.y += this.vy

      // 边缘弹回
      if (this.x < 0 || this.x > width) this.vx = -this.vx
      if (this.y < 0 || this.y > height) this.vy = -this.vy

      // 鼠标交互排斥效果
      if (mouse.x !== null && mouse.y !== null) {
        const dx = this.x - mouse.x
        const dy = this.y - mouse.y
        const dist = Math.hypot(dx, dy)
        if (dist < mouse.radius) {
          const force = (mouse.radius - dist) / mouse.radius
          const angle = Math.atan2(dy, dx)
          // 产生阻尼推力
          this.x += Math.cos(angle) * force * 1.5
          this.y += Math.sin(angle) * force * 1.5
        }
      }
    }

    draw() {
      ctx.save()
      ctx.beginPath()
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2)
      ctx.fillStyle = this.color
      ctx.globalAlpha = this.alpha
      
      // 产生微弱发光阴影效果
      ctx.shadowBlur = 10
      ctx.shadowColor = this.color
      ctx.fill()
      ctx.restore()
    }
  }

  // 初始化粒子
  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle())
  }

  // 绘制粒子连线网格 (星座网格)
  const drawLines = () => {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x
        const dy = particles[i].y - particles[j].y
        const dist = Math.hypot(dx, dy)

        if (dist < connectionDistance) {
          // 距离越近，连线越亮
          const alpha = (1 - dist / connectionDistance) * 0.13
          ctx.strokeStyle = '#8b5cf6'
          ctx.lineWidth = 0.6
          ctx.globalAlpha = alpha
          ctx.beginPath()
          ctx.moveTo(particles[i].x, particles[i].y)
          ctx.lineTo(particles[j].x, particles[j].y)
          ctx.stroke()
        }
      }
    }
  }

  // 循环渲染
  const animate = () => {
    ctx.clearRect(0, 0, width, height)
    
    particles.forEach(p => {
      p.update()
      p.draw()
    })

    drawLines()
    animationId = requestAnimationFrame(animate)
  }

  animate()

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize)
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseleave', handleMouseLeave)
    window.removeEventListener('click', closeDropdown)
    cancelAnimationFrame(animationId)
  })
})

// 自定义 Toast 系统
const toast = ref({ show: false, message: '', type: 'success' })
const showToast = (message, type = 'success') => {
  toast.value = { show: true, message, type }
  setTimeout(() => {
    toast.value.show = false
  }, 3000)
}

// 保存豆包与 ASR 语音识别配置设置
const saveSettings = () => {
  localStorage.setItem('doubaoApiKey', doubaoApiKey.value)
  localStorage.setItem('doubaoEndpointId', doubaoEndpointId.value)
  localStorage.setItem('enableDoubao', enableDoubao.value ? 'true' : 'false')
  
  localStorage.setItem('asrApiKey', asrApiKey.value)
  localStorage.setItem('asrEndpoint', asrEndpoint.value)
  localStorage.setItem('asrModel', asrModel.value)
  localStorage.setItem('enableAsr', enableAsr.value ? 'true' : 'false')

  localStorage.setItem('summaryProvider', summaryProvider.value)
  localStorage.setItem('siliconflowLlApiKey', siliconflowLlApiKey.value)
  localStorage.setItem('siliconflowLlModel', siliconflowLlModel.value)

  currentPage.value = 'main'
  showToast('配置设置已成功保存并生效！', 'success')
}

// 触发设置齿轮点击
const triggerSettingsClick = () => {
  if (!currentUser.value) {
    showToast('请先登录账号！', 'error')
    return
  }

  if (currentUser.value.role === 'admin') {
    currentPage.value = currentPage.value === 'settings' ? 'main' : 'settings'
    return
  }

  if (currentUser.value.role === 'super') {
    if (currentPage.value === 'settings') {
      currentPage.value = 'main'
      return
    }
    settingsPassword.value = ''
    passwordErrorMsg.value = ''
    showPasswordModal.value = true
    return
  }

  showToast('普通用户无权查看或修改系统配置！', 'error')
}

// 验证设置访问密码
const verifySettingsPassword = () => {
  passwordErrorMsg.value = ''
  if (settingsPassword.value === 'jikelby05') {
    showPasswordModal.value = false
    currentPage.value = 'settings'
    settingsPassword.value = ''
    showToast('验证通过，已开启配置面板！', 'success')
  } else {
    passwordErrorMsg.value = '访问密码错误，请输入正确的设置访问密码！'
    showToast('访问密码错误，拒绝开启配置！', 'error')
  }
}

// 关闭外网密钥配置弹框
const closeAccessKeyModal = () => {
  showAccessKeyModal.value = false
  isParsing.value = false
  stopProgress()
}

// 保存外网密钥配置
const saveAccessKey = () => {
  if (!tempAccessKey.value.trim()) {
    showToast('请输入有效的密钥', 'error')
    return
  }
  accessKey.value = tempAccessKey.value.trim()
  sessionStorage.setItem('accessKey', accessKey.value)
  showAccessKeyModal.value = false
  showToast('密钥已保存，正在重新解析...', 'success')
  handleParse()
}

// 嗅探步骤模拟
const currentStep = ref(0)
const steps = [
  '正在唤醒后台无头浏览器引擎...',
  '正在进行指纹伪装，绕过平台安全护盾...',
  '正在注入拦截探针，实时嗅探数据流并提取原文字幕...',
  '正在解析视频物理直链并唤起 AI 深度大模型...'
]

let stepInterval = null

const startProgress = () => {
  currentStep.value = 0
  stepInterval = setInterval(() => {
    if (currentStep.value < steps.length - 1) {
      currentStep.value++
    } else {
      clearInterval(stepInterval)
    }
  }, 3000)
}

const stopProgress = () => {
  clearInterval(stepInterval)
  currentStep.value = steps.length
}

const ENGINE_API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000'
  : window.location.origin

const extractUrl = (text) => {
  const match = text.match(/(https?:\/\/[^\s]+)/g)
  return match ? match[0] : null
}

const isSummarizing = ref(false)
const hasSummarized = ref(false)

const handleParse = async () => {
  if (currentUser.value && currentUser.value.role === 'user' && currentUser.value.remaining <= 0) {
    showToast('今日已达到免费提取上限！无法继续解析新视频。', 'error')
    return
  }

  const rawUrl = inputUrl.value.trim()
  const cleanUrl = extractUrl(rawUrl)

  if (!cleanUrl) {
    errorMsg.value = '未检测到有效的视频链接，请输入包含 http/https 的网址'
    showToast('请输入有效的视频链接', 'error')
    return
  }

  // 🔑 外网密钥本地检查 (仅针对 YouTube/TikTok 等海外平台)
  const isOverseas = cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be') || cleanUrl.includes('tiktok.com')
  if (isOverseas && !accessKey.value) {
    showAccessKeyModal.value = true
    tempAccessKey.value = ''
    showToast('解析海外平台视频需要配置密钥！', 'warning')
    return
  }

  isParsing.value = true
  errorMsg.value = ''
  parseResult.value = null
  activeTab.value = 'video' // 默认回到视频播放标签
  hasSummarized.value = false
  isSummarizing.value = false
  const startTime = performance.now()
  startProgress()

  try {
    const res = await fetchWithAuth(`${ENGINE_API_URL}/api/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        url: cleanUrl,
        apiKey: enableDoubao.value ? doubaoApiKey.value : '',
        endpointId: enableDoubao.value ? doubaoEndpointId.value : '',
        accessKey: accessKey.value
      })
    })

    const data = await res.json()

    if (res.status === 403 || data.error === 'KEY_REQUIRED' || data.error === 'INVALID_KEY') {
      showAccessKeyModal.value = true
      tempAccessKey.value = accessKey.value
      throw new Error(data.message || '解析此平台视频需要输入外网访问密钥')
    }

    if (!res.ok || !data.success) {
      throw new Error(data.error || '解析失败，请检查链接是否正确')
    }

    const endTime = performance.now()
    parseDuration.value = ((endTime - startTime) / 1000).toFixed(2)

    parseResult.value = {
      title: data.title || '已解析视频',
      cover: data.cover || '',
      videoUrl: data.videoUrl,
      targetUrl: data.targetUrl,
      platform: data.platform || '未知平台',
      description: data.description || '该视频未提供额外的文案描述。',
      aiSummary: {
        category: '综合创作',
        points: ['已提取高清视频物理流直链。', '点击下方的按钮可直接高速下载。', '若要转写人声文案与 AI 总结，请点击上方相应页签。'],
        suggestion: '提示：请点击上方“提取文案”或“AI核心总结”以按需调用 ASR 服务转写语音。',
        isRealAI: false
      }
    }

    // 成功后扣减可用次数 (仅普通用户)
    if (currentUser.value && currentUser.value.role === 'user') {
      currentUser.value.remaining = Math.max(0, currentUser.value.remaining - 1)
    }

    showToast('视频流提取成功，可立即下载！', 'success')
  } catch (err) {
    errorMsg.value = err.message || '网络连接失败，请确保本地后端已启动！'
    showToast('解析失败，请查看报错信息', 'error')
  } finally {
    isParsing.value = false
    stopProgress()
  }
}

// 异步按需提取语音字幕与 AI 总结
const fetchSummaryAndTranscript = async () => {
  if (hasSummarized.value || isSummarizing.value || !parseResult.value) return

  isSummarizing.value = true
  showToast('正在异步请求 ASR 识别与 AI 深度总结，请稍候...', 'success')

  try {
    const res = await fetchWithAuth(`${ENGINE_API_URL}/api/summarize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        videoUrl: parseResult.value.videoUrl,
        targetUrl: parseResult.value.targetUrl,
        title: parseResult.value.title,
        platform: parseResult.value.platform,
        description: parseResult.value.description,
        summaryProvider: summaryProvider.value,
        apiKey: summaryProvider.value === 'doubao' ? doubaoApiKey.value : '',
        endpointId: summaryProvider.value === 'doubao' ? doubaoEndpointId.value : '',
        asrApiKey: enableAsr.value ? asrApiKey.value : '',
        asrEndpoint: enableAsr.value ? asrEndpoint.value : '',
        asrModel: enableAsr.value ? asrModel.value : '',
        llmApiKey: summaryProvider.value === 'siliconflow' ? (siliconflowLlApiKey.value || asrApiKey.value) : '',
        llmModel: summaryProvider.value === 'siliconflow' ? siliconflowLlModel.value : ''
      })
    })
    const data = await res.json()
    if (res.ok && data.success) {
      parseResult.value.aiSummary = data.aiSummary
      parseResult.value.description = data.transcript || parseResult.value.description
      hasSummarized.value = true
      showToast('AI 核心总结与文案提取成功！', 'success')
    } else {
      showToast(data.message || 'AI 总结提取失败！', 'error')
    }
  } catch (err) {
    showToast('AI 总结请求失败！', 'error')
  } finally {
    isSummarizing.value = false
  }
}

const switchTab = (tab) => {
  activeTab.value = tab
  if (tab === 'copywriting' || tab === 'summary') {
    fetchSummaryAndTranscript()
  }
}

const platformClass = computed(() => {
  if (!parseResult.value) return ''
  const p = parseResult.value.platform.toLowerCase()
  if (p === 'bilibili') return 'bilibili'
  if (p === '抖音' || p === 'douyin') return 'douyin'
  if (p === '小红书' || p === 'xhs') return 'xhs'
  if (p === 'tiktok') return 'tiktok'
  if (p === 'youtube') return 'youtube'
  return 'generic'
})

const clearInput = () => {
  inputUrl.value = ''
}

const proxyVideoUrl = computed(() => {
  if (!parseResult.value) return ''
  return `${ENGINE_API_URL}/api/download?videoUrl=${encodeURIComponent(parseResult.value.videoUrl)}&referer=${encodeURIComponent(parseResult.value.targetUrl)}&title=${encodeURIComponent(parseResult.value.title)}&accessKey=${encodeURIComponent(accessKey.value)}`
})

const copyUrl = (url, msg = '高清直链已复制到剪贴板！') => {
  navigator.clipboard.writeText(url)
  showToast(msg, 'success')
}

const fillExample = (url) => {
  inputUrl.value = url
  showToast('已载入示例链接，按 Enter 开始', 'success')
}
</script>

<template>
  <!-- Global Canvas Particles and Glows -->
  <canvas ref="canvasRef" class="particle-canvas"></canvas>
  <div class="glow-bg-node node-1"></div>
  <div class="glow-bg-node node-2"></div>

  <!-- Custom Toast Alert Component -->
  <Transition name="toast-fade">
    <div v-if="toast.show" class="custom-toast" :class="toast.type">
      <span class="toast-icon">
        <svg v-if="toast.type === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </span>
      <span class="toast-message">{{ toast.message }}</span>
    </div>
  </Transition>

  <!-- Settings Password Verification Modal (Security gate modal overlay, remains as modal) -->
  <Transition name="toast-fade">
    <div v-if="showPasswordModal" class="settings-overlay" @click.self="showPasswordModal = false">
      <div class="settings-modal" style="max-width: 360px;">
        <button class="settings-close" @click="showPasswordModal = false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <h3 class="settings-title">🔑 访问授权验证</h3>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 20px; line-height: 1.5; text-align: left;">
          该模块为高级配置面板。请输入管理员密码进行身份授权。
        </p>
        
        <div class="form-group" style="text-align: left;">
          <label class="form-label">访问密码 (Password)</label>
          <input 
            type="password" 
            v-model="settingsPassword" 
            placeholder="请输入设置访问密码" 
            class="form-input"
            @keyup.enter="verifySettingsPassword"
          />
          <span v-if="passwordErrorMsg" class="err-text" style="display: block; font-size: 0.8rem; color: var(--color-rose); margin-top: 6px;">
            {{ passwordErrorMsg }}
          </span>
        </div>

        <button class="settings-save-btn" @click="verifySettingsPassword">确认授权</button>
      </div>
    </div>
  </Transition>

  <!-- Access Key Modal (for Overseas Platforms download validation, remains as modal) -->
  <Transition name="toast-fade">
    <div v-if="showAccessKeyModal" class="settings-overlay" @click.self="closeAccessKeyModal">
      <div class="settings-modal">
        <button class="settings-close" @click="closeAccessKeyModal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <h3 class="settings-title">🔑 输入外网访问密钥</h3>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 20px; line-height: 1.5; text-align: left;">
          检测到您正在解析或下载海外平台（如 YouTube、TikTok）视频。请配置外网访问密钥以授权下载。
        </p>
        
        <div class="form-group" style="text-align: left;">
          <label class="form-label">访问密钥 (Access Key)</label>
          <input 
            type="password" 
            v-model="tempAccessKey" 
            placeholder="该平台需外网密钥，请输入：" 
            class="form-input"
            @keyup.enter="saveAccessKey"
          />
        </div>

        <button class="settings-save-btn" @click="saveAccessKey">确认提交</button>
      </div>
    </div>
  </Transition>

  <!-- ==================== PAGE: AUTH ==================== -->
  <div v-if="currentPage === 'auth' || !currentUser" class="auth-overlay">
    <div class="auth-card animate-slide-up">
      <div class="auth-logo">
        <span class="logo-text">VidFetch</span>
        <span class="badge-pro">ULTRA</span>
      </div>
      <p class="auth-subtitle">视频嗅探下载与 AI 智能提取专家</p>
      
      <div class="auth-tabs">
        <button 
          class="auth-tab-btn" 
          :class="{ 'active': authTab === 'login' }"
          @click="authTab = 'login'"
        >
          登录
        </button>
        <button 
          class="auth-tab-btn" 
          :class="{ 'active': authTab === 'register' }"
          @click="authTab = 'register'"
        >
          注册普通用户
        </button>
      </div>
      
      <!-- Login Form -->
      <div v-if="authTab === 'login'" class="auth-form animate-fade-in">
        <div class="form-group">
          <label class="form-label">用户名</label>
          <input 
            type="text" 
            v-model="loginUsername" 
            placeholder="请输入用户名 (如: mediaAdmin)" 
            class="form-input"
            @keyup.enter="handleLogin"
          />
        </div>
        <div class="form-group">
          <label class="form-label">密码</label>
          <input 
            type="password" 
            v-model="loginPassword" 
            placeholder="请输入密码" 
            class="form-input"
            @keyup.enter="handleLogin"
          />
        </div>
        <button class="auth-submit-btn" @click="handleLogin">登录 VidFetch</button>
      </div>
      
      <!-- Register Form -->
      <div v-else class="auth-form animate-fade-in">
        <div class="form-group">
          <label class="form-label">用户名 (至少3位)</label>
          <input 
            type="text" 
            v-model="regUsername" 
            placeholder="创建登录账号名" 
            class="form-input"
            @keyup.enter="handleRegister"
          />
        </div>
        <div class="form-group">
          <label class="form-label">密码</label>
          <input 
            type="password" 
            v-model="regPassword" 
            placeholder="设置登录密码" 
            class="form-input"
            @keyup.enter="handleRegister"
          />
        </div>
        <div class="form-group">
          <label class="form-label">昵称 (显示名称)</label>
          <input 
            type="text" 
            v-model="regNickname" 
            placeholder="设置您的显示昵称" 
            class="form-input"
            @keyup.enter="handleRegister"
          />
        </div>
        <button class="auth-submit-btn" @click="handleRegister">确认注册账号</button>
      </div>
    </div>
  </div>

  <!-- ==================== MAIN PAGES WRAPPER ==================== -->
  <div class="vidfetch-container" v-else>
    <!-- Top Nav / User Profile Bar -->
    <div class="top-nav-bar">
      <div class="nav-user-profile" @click.stop="showProfileDropdown = !showProfileDropdown">
        <img :src="currentUser.avatar" class="nav-avatar" alt="Avatar" />
        <span class="nav-nickname">{{ currentUser.nickname || currentUser.username }}</span>
        <span class="nav-role-badge" :class="currentUser.role">
          {{ currentUser.role === 'admin' ? '管理员' : currentUser.role === 'super' ? '超级用户' : '普通用户' }}
        </span>
        <svg class="dropdown-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        
        <!-- Profile Dropdown Menu -->
        <Transition name="toast-fade">
          <div v-if="showProfileDropdown" class="profile-dropdown-menu">
            <div class="dropdown-header">
              <p class="dropdown-nickname">{{ currentUser.nickname }}</p>
              <p class="dropdown-username">@{{ currentUser.username }}</p>
            </div>
            <div class="dropdown-divider"></div>
            <button class="dropdown-item" @click="openEditProfile">
              👤 编辑个人信息
            </button>
            <button class="dropdown-item" v-if="currentUser.role === 'admin'" @click="openAdminDashboard">
              🖥️ 账号与日志管理
            </button>
            <button class="dropdown-item" @click="triggerSettingsClick" v-if="currentUser.role !== 'user'">
              ⚙️ AI 配置中心
            </button>
            <div class="dropdown-divider"></div>
            <button class="dropdown-item logout" @click="handleLogout">
              🚪 退出登录
            </button>
          </div>
        </Transition>
      </div>
    </div>

    <!-- ==================== currentPage: settings ==================== -->
    <main class="main-card animate-slide-up sub-page" v-if="currentPage === 'settings'">
      <div class="page-header">
        <button class="back-btn" @click="currentPage = 'main'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="back-icon"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          返回主页
        </button>
        <h2 class="page-title">⚙️ AI 核心配置面板</h2>
      </div>
      
      <div class="settings-page-content animate-fade-in" style="text-align: left; margin-top: 20px;">
        <div class="form-group">
          <label class="form-label">AI 总结大模型服务商选择</label>
          <select v-model="summaryProvider" class="form-input">
            <option value="siliconflow" style="background:#0f1123; color:#f1f5f9;">硅基流动 SiliconFlow (推荐 - 100%免费模型)</option>
            <option value="doubao" style="background:#0f1123; color:#f1f5f9;">火山引擎 (豆包 AI - 需自备 Key/Endpoint)</option>
          </select>
        </div>

        <!-- SiliconFlow LLM Settings -->
        <div v-if="summaryProvider === 'siliconflow'">
          <div class="form-group">
            <label class="form-label">总结 API Key (留空则共用下方 ASR Key)</label>
            <input type="password" v-model="siliconflowLlApiKey" placeholder="输入 SiliconFlow Key，留空则默认共用下方 ASR Key" class="form-input" />
          </div>

          <div class="form-group">
            <label class="form-label">总结模型名称 (Model Name)</label>
            <input type="text" v-model="siliconflowLlModel" placeholder="例如: Qwen/Qwen2.5-7B-Instruct" class="form-input" />
            <span class="form-tip">提示：推荐使用免费高速模型 `Qwen/Qwen2.5-7B-Instruct` 或 `THUDM/glm-4-9b-chat`</span>
          </div>
        </div>

        <!-- Doubao LLM Settings -->
        <div v-if="summaryProvider === 'doubao'">
          <div class="form-group">
            <label class="form-label">火山引擎 API Key</label>
            <input type="password" v-model="doubaoApiKey" placeholder="输入火山引擎以 Bearer 开头的 API Key" class="form-input" />
          </div>

          <div class="form-group">
            <label class="form-label">接入点 Endpoint ID</label>
            <input type="text" v-model="doubaoEndpointId" placeholder="例如: ep-202409xxxx-xxxx" class="form-input" />
            <span class="form-tip">提示：在火山引擎 Ark 控制台部署豆包模型获取 Endpoint ID。</span>
          </div>
        </div>

        <h3 class="settings-title" style="margin-top: 30px; border-top: 1px solid var(--border-color); padding-top: 20px;">🎙️ ASR 语音识别转写配置</h3>
        
        <div class="form-group">
          <label class="form-label">启用语音转文字 (提取视频文案)</label>
          <div class="switch-group">
            <span class="switch-label-status">{{ enableAsr ? '已开启 (切换页签时调用 ASR 服务)' : '未开启 (默认采用原始视频描述)' }}</span>
            <input type="checkbox" v-model="enableAsr" class="glow-checkbox" />
          </div>
        </div>

        <div class="form-group" v-if="enableAsr">
          <label class="form-label">ASR API Key (可使用硅基流动 Key)</label>
          <input type="password" v-model="asrApiKey" placeholder="输入以 Bearer 开头的 ASR Key" class="form-input" />
        </div>

        <div class="form-group" v-if="enableAsr">
          <label class="form-label">ASR Endpoint 接口节点</label>
          <input type="text" v-model="asrEndpoint" placeholder="例如: https://api.siliconflow.cn/v1" class="form-input" />
          <span class="form-tip">提示：兼容 OpenAI 格式。国内服务器部署推荐 `https://api.siliconflow.cn/v1`</span>
        </div>

        <div class="form-group" v-if="enableAsr">
          <label class="form-label">ASR Model 识别模型</label>
          <input type="text" v-model="asrModel" placeholder="例如: FunAudioLLM/SenseVoiceSmall" class="form-input" />
          <span class="form-tip">提示：硅基流动的 `FunAudioLLM/SenseVoiceSmall` 模型完全免费！</span>
        </div>

        <button class="settings-save-btn" style="margin-top: 20px;" @click="saveSettings">保存配置并生效</button>
      </div>
    </main>

    <!-- ==================== currentPage: profile ==================== -->
    <main class="main-card animate-slide-up sub-page" v-else-if="currentPage === 'profile'">
      <div class="page-header">
        <button class="back-btn" @click="currentPage = 'main'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="back-icon"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          返回主页
        </button>
        <h2 class="page-title">👤 编辑个人账户信息</h2>
      </div>
      
      <div class="settings-page-content animate-fade-in" style="text-align: left; margin-top: 20px;">
        <div class="form-group">
          <label class="form-label">昵称 (显示昵称)</label>
          <input type="text" v-model="editNickname" placeholder="请输入您的昵称" class="form-input" />
        </div>
        
        <div class="form-group">
          <label class="form-label">修改密码 (留空则不修改)</label>
          <input type="password" v-model="editPassword" placeholder="输入新密码" class="form-input" />
        </div>
        
        <div class="form-group">
          <label class="form-label">头像随机种子 (基于 Dicebear 生成)</label>
          <div style="display: flex; gap: 12px; align-items: center;">
            <input type="text" v-model="editAvatarSeed" placeholder="输入文字生成专属头像" class="form-input" style="flex: 1;" />
            <img :src="`https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(editAvatarSeed || currentUser?.username)}`" style="width: 48px; height: 48px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color);" alt="头像预览" />
          </div>
        </div>
        
        <button class="settings-save-btn" style="margin-top: 20px;" @click="handleProfileUpdate">保存修改</button>
      </div>
    </main>

    <!-- ==================== currentPage: admin ==================== -->
    <main class="main-card animate-slide-up sub-page" v-else-if="currentPage === 'admin'">
      <div class="page-header">
        <button class="back-btn" @click="currentPage = 'main'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="back-icon"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          返回主页
        </button>
        <h2 class="page-title">🖥️ VidFetch 管理员后台</h2>
      </div>
      
      <div class="admin-tabs" style="margin-top: 20px;">
        <button 
          class="admin-tab-btn" 
          :class="{ 'active': adminTab === 'users' }"
          @click="adminTab = 'users'"
        >
          👥 账号管理
        </button>
        <button 
          class="admin-tab-btn" 
          :class="{ 'active': adminTab === 'logs' }"
          @click="adminTab = 'logs'"
        >
          📋 操作日志审计
        </button>
      </div>
      
      <!-- Users Tab -->
      <div v-if="adminTab === 'users'" class="admin-pane animate-fade-in">
        <div class="admin-action-row" style="text-align: left; margin-bottom: 16px;">
          <button class="create-user-toggle-btn" @click="showCreateUserForm = !showCreateUserForm">
            {{ showCreateUserForm ? '❌ 取消创建' : '➕ 创建新账号' }}
          </button>
        </div>
        
        <!-- Create User Form -->
        <div v-if="showCreateUserForm" class="create-user-form animate-fade-in" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 20px; border-radius: 12px; margin-bottom: 20px; text-align: left;">
          <div class="form-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
            <div class="form-group">
              <label class="form-label">用户名</label>
              <input type="text" v-model="createUsername" placeholder="用户名" class="form-input" />
            </div>
            <div class="form-group">
              <label class="form-label">密码</label>
              <input type="password" v-model="createPassword" placeholder="密码" class="form-input" />
            </div>
            <div class="form-group">
              <label class="form-label">昵称</label>
              <input type="text" v-model="createNickname" placeholder="显示昵称" class="form-input" />
            </div>
            <div class="form-group">
              <label class="form-label">角色类型</label>
              <select v-model="createRole" class="form-input">
                <option value="user" style="background:#0f1123; color:#f1f5f9;">普通用户 (日限5次)</option>
                <option value="super" style="background:#0f1123; color:#f1f5f9;">超级用户 (无限制，限1个)</option>
                <option value="admin" style="background:#0f1123; color:#f1f5f9;">系统管理员 (无限制，限1个)</option>
              </select>
            </div>
          </div>
          <button class="settings-save-btn" style="margin-top: 10px;" @click="handleCreateUser">确认创建账号</button>
        </div>
        
        <!-- Users List Table -->
        <div class="table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th>用户昵称</th>
                <th>账号名</th>
                <th>角色</th>
                <th>今日已提取</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in adminUsers" :key="user.username">
                <td>
                  <div class="table-user-cell" style="display: flex; align-items: center; gap: 8px;">
                    <img :src="user.avatar" class="table-avatar" style="width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.05);" />
                    <span style="font-weight: 600;">{{ user.nickname }}</span>
                  </div>
                </td>
                <td>{{ user.username }}</td>
                <td>
                  <span class="role-badge" :class="user.role">
                    {{ user.role === 'admin' ? '管理员' : user.role === 'super' ? '超级用户' : '普通用户' }}
                  </span>
                </td>
                <td>
                  <span style="font-weight: 700; color: var(--text-primary);">{{ user.usage[new Date().toISOString().split('T')[0]] || 0 }}</span> / 
                  <span>{{ user.role === 'admin' || user.role === 'super' ? '∞' : '5' }}</span>
                </td>
                <td>
                  <button 
                    class="delete-user-btn" 
                    v-if="user.username !== 'mediaAdmin' && user.username !== 'mediaSuper'"
                    @click="handleDeleteUser(user.username)"
                  >
                    删除
                  </button>
                  <span v-else style="color: var(--text-muted); font-size: 0.8rem;">内置保护</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <!-- Logs Tab -->
      <div v-else class="admin-pane animate-fade-in">
        <div class="table-container logs-table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th style="width: 140px;">操作时间</th>
                <th>账号 (角色)</th>
                <th>操作动作</th>
                <th>视频提取链接</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(log, idx) in adminLogs" :key="idx">
                <td class="log-time-cell">{{ formatDate(log.timestamp) }}</td>
                <td>
                  <span style="font-weight: 600; color: var(--text-primary);">{{ log.username }}</span>
                  <span class="role-badge-mini" :class="log.role">{{ log.role }}</span>
                </td>
                <td style="color: var(--color-emerald); font-weight: 600;">{{ log.action }}</td>
                <td class="log-url-cell">
                  <a v-if="log.targetUrl" :href="log.targetUrl" target="_blank" class="log-url-link" :title="log.targetUrl">
                    {{ log.targetUrl }}
                  </a>
                  <span v-else>-</span>
                </td>
              </tr>
              <tr v-if="adminLogs.length === 0">
                <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 30px;">
                  暂无任何操作日志记录
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <!-- ==================== currentPage: main ==================== -->
    <div class="page-content-wrapper animate-fade-in" v-else-if="currentPage === 'main'">
      <!-- Header -->
      <header class="hero-header animate-fade-in">
        <div class="logo-wrapper">
          <span class="logo-text">VidFetch</span>
          <span class="badge-pro">ULTRA</span>
          <span class="badge-author">BY LBY</span>
          <!-- Settings Gear Button -->
          <button v-if="currentUser && currentUser.role !== 'user'" class="action-settings-btn" @click="triggerSettingsClick" title="AI 配置">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="gear-icon"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
        <p class="subtitle">全面支持抖音、B站、小红书、TikTok、YouTube，已深度接入 B站语音字幕转写及豆包 LLM 大模型！</p>
      </header>

      <!-- Main Card -->
      <main class="main-card animate-slide-up">
        <!-- User Usage Banner for normal users -->
        <div v-if="currentUser?.role === 'user'" class="usage-banner" :class="{ 'warning': currentUser.remaining <= 0 }">
          <div class="usage-info">
            <span v-if="currentUser.remaining > 0">🎁 免费用户今日剩余额度：<strong>{{ currentUser.remaining }}</strong> / 5 次</span>
            <span v-else>⚠️ 今日已免费提取上限！无法继续提取/下载</span>
          </div>
          <div class="usage-progress" v-if="currentUser.remaining > 0">
            <div class="usage-bar" :style="{ width: `${(currentUser.remaining / 5) * 100}%` }"></div>
          </div>
        </div>

        <!-- Input Panel -->
        <section class="input-panel">
          <div class="input-glow-wrapper" :class="{ 'disabled': currentUser?.role === 'user' && currentUser?.remaining <= 0 }">
            <input 
              type="text" 
              v-model="inputUrl" 
              placeholder="粘贴抖音、B站、小红书、TikTok、YouTube等链接或分享口令..." 
              class="glow-input"
              @keyup.enter="handleParse"
              :disabled="isParsing || (currentUser?.role === 'user' && currentUser?.remaining <= 0)"
            />
            <!-- Clear Button -->
            <button v-if="inputUrl && !isParsing && !(currentUser?.role === 'user' && currentUser?.remaining <= 0)" class="clear-btn" @click="clearInput">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <button 
              @click="handleParse" 
              :disabled="isParsing || (currentUser?.role === 'user' && currentUser?.remaining <= 0)" 
              class="glow-button"
              :class="{ 'loading': isParsing, 'disabled': currentUser?.role === 'user' && currentUser?.remaining <= 0 }"
            >
              <span v-if="!isParsing">提取并总结</span>
              <span v-else class="spinner"></span>
            </button>
          </div>

          <div class="quick-examples">
            <span class="label">快速测试:</span>
            <button class="ex-btn" @click="fillExample('https://www.bilibili.com/video/BV1GJ411x7h7/')">
              <span class="plat-mini-dot bilibili"></span>B站示例
            </button>
            <button class="ex-btn" @click="fillExample('https://v.douyin.com/idK1o93q/')">
              <span class="plat-mini-dot douyin"></span>抖音示例
            </button>
            <button class="ex-btn" @click="fillExample('https://www.xiaohongshu.com/explore/65cf0bfd000000000701b7a2')">
              <span class="plat-mini-dot xhs"></span>小红书示例
            </button>
            <button class="ex-btn" @click="fillExample('https://www.youtube.com/watch?v=dQw4w9WgXcQ')">
              <span class="plat-mini-dot youtube"></span>YouTube示例
            </button>
          </div>
        </section>

        <!-- Progress Panel -->
        <section v-if="isParsing" class="progress-panel animate-fade-in">
          <div class="stepper-title-wrapper">
            <div class="stepper-title">正在执行底层多维度抓取...</div>
            <div class="loading-wave">
              <span></span><span></span><span></span><span></span>
            </div>
          </div>
          <div class="stepper-wrapper">
            <div 
              v-for="(step, index) in steps" 
              :key="index" 
              class="step-item"
              :class="{ 
                'active': currentStep === index, 
                'completed': currentStep > index 
              }"
            >
              <div class="step-indicator">
                <span v-if="currentStep > index">
                  <svg class="check-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
                </span>
                <span v-else>{{ index + 1 }}</span>
              </div>
              <div class="step-content">{{ step }}</div>
            </div>
          </div>
        </section>

        <!-- Error Message -->
        <div v-if="errorMsg" class="error-banner animate-shake">
          <span class="err-icon">⚠️</span>
          <span class="err-text">{{ errorMsg }}</span>
        </div>

        <!-- Result Panel -->
        <section v-if="parseResult" class="result-panel animate-fade-in">
          <div class="result-grid">
            <!-- Left: Preview Cover or Player -->
            <div class="media-container-wrapper">
              <div class="media-container">
                <div class="badge-platform" :class="platformClass">
                  <!-- Dynamic Platform Badge SVG Icon -->
                  <svg v-if="parseResult.platform === 'Bilibili'" class="badge-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17.87 2.65a.75.75 0 0 1 .53.22c.28.28.29.74.02 1.03l-1.8 1.8h2.09c1.9 0 3.44 1.54 3.44 3.44v7.41c0 1.9-1.54 3.45-3.44 3.45H5.33c-1.9 0-3.44-1.55-3.44-3.45V9.14c0-1.9 1.54-3.44 3.44-3.44h2.1l-1.8-1.8a.74.74 0 0 1 .02-1.03c.3-.28.75-.27 1.03.02l2.42 2.42c.28.28.29.74.02 1.03l-.02.02H15l2.4-2.4c.14-.14.34-.22.47-.22M5.33 7.15c-.9 0-1.63.73-1.63 1.63v7.41c0 .9.73 1.63 1.63 1.63h13.34c.9 0 1.63-.73 1.63-1.63V8.78c0-.9-.73-1.63-1.63-1.63H5.33M9.75 10.5c.62 0 1.12.5 1.12 1.13v1.5c0 .62-.5 1.12-1.12 1.12s-1.13-.5-1.13-1.12v-1.5c0-.63.5-1.13 1.13-1.13m4.5 0c.62 0 1.13.5 1.13 1.13v1.5c0 .62-.5 1.12-1.13 1.12s-1.12-.5-1.12-1.12v-1.5c0-.63.5-1.13 1.12-1.13Z"/></svg>
                  <svg v-else-if="parseResult.platform === '抖音'" class="badge-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12.53 2.24a5.3 5.3 0 0 0 4.15 2.1c.07.97-.24 1.93-.86 2.7a5.5 5.5 0 0 1-2.9-1.9c-.1-.08-.13-.23-.07-.34l.07-.1c.32-.47.53-1 .6-1.57.01-.2-.14-.36-.34-.37l-2-.02c-.22 0-.4.18-.4.4V14c0 1.65-1.34 3-3 3s-3-1.35-3-3 1.34-3 3-3c.4 0 .8.09 1.16.26.18.09.4 0 .43-.2l.33-1.92c.03-.22-.12-.42-.34-.46A5 5 0 0 0 8.5 8c-3.87 0-7 3.13-7 7s3.13 7 7 7 7-3.13 7-7v-6.7c1.37.94 3.01 1.48 4.76 1.52.22 0 .4-.18.4-.4V6.52c0-.2-.15-.37-.35-.4a3.3 3.3 0 0 1-2.8-2.86c-.03-.2-.2-.34-.4-.34h-2.15c-.22 0-.4.18-.4.4Z"/></svg>
                  <svg v-else-if="parseResult.platform === '小红书'" class="badge-icon" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 7a5 5 0 1 0 5 5 5 5 0 0 0-5-5zm0 8a3 3 0 1 1 3-3 3 3 0 0 1-3 3z" fill-rule="evenodd"/></svg>
                  <svg v-else-if="parseResult.platform === 'TikTok'" class="badge-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 5.82a5 5 0 0 1-3.6-2.1V14.5a4.5 4.5 0 1 1-9-1.8 4.5 4.5 0 0 1 8.2-2.3v-6.1A6.7 6.7 0 0 0 16.6 9V5.82z"/></svg>
                  <svg v-else-if="parseResult.platform === 'YouTube'" class="badge-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.518 3.545 12 3.545 12 3.545s-7.518 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.87.508 9.388.508 9.388.508s7.518 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                  <svg v-else class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>
                  {{ parseResult.platform }}
                </div>
                
                <!-- Custom Embedded Player using CORS proxy -->
                <video 
                  controls 
                  :src="proxyVideoUrl" 
                  class="video-preview" 
                  :poster="parseResult.cover"
                  preload="metadata"
                ></video>
              </div>
            </div>

            <!-- Right: Tabs panel (Bento Architecture) -->
            <div class="meta-container">
              <div>
                <h2 class="video-title">{{ parseResult.title }}</h2>
                
                <!-- Bento-styled high-tech tabs -->
                <div class="tabs-header">
                  <button 
                    class="tab-btn" 
                    :class="{ 'active': activeTab === 'video' }"
                    @click="switchTab('video')"
                  >
                    🎥 视频下载
                  </button>
                  <button 
                    class="tab-btn" 
                    :class="{ 'active': activeTab === 'copywriting' }"
                    @click="switchTab('copywriting')"
                  >
                    ✍️ 提取文案
                  </button>
                  <button 
                    class="tab-btn" 
                    :class="{ 'active': activeTab === 'summary' }"
                    @click="switchTab('summary')"
                  >
                    🧠 AI 核心总结
                  </button>
                </div>

                <!-- Tab Contents -->
                <div class="tabs-content">
                  <!-- Tab 1: Video Info -->
                  <div v-if="activeTab === 'video'" class="tab-pane animate-fade-in">
                    <div class="diagnostic-grid">
                      <div class="diag-item">
                        <div class="diag-label">嗅探解析耗时</div>
                        <div class="diag-value highlight">{{ parseDuration }} 秒</div>
                      </div>
                      <div class="diag-item">
                        <div class="diag-label">画质规格</div>
                        <div class="diag-value">高清 (1080P/720P)</div>
                      </div>
                      <div class="diag-item">
                        <div class="diag-label">代理模式</div>
                        <div class="diag-value">CORS Bypass Proxy</div>
                      </div>
                    </div>

                    <div class="meta-info">
                      <div class="info-row">
                        <span class="info-label">源网页链接:</span>
                        <a :href="parseResult.targetUrl" target="_blank" class="info-link">{{ parseResult.targetUrl }}</a>
                      </div>
                    </div>

                    <div class="action-buttons">
                      <a :href="proxyVideoUrl" class="action-btn download-btn">
                        <svg class="icon animate-bounce-y" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                        下载高清 MP4 视频
                      </a>
                      <button class="action-btn copy-btn" @click="copyUrl(parseResult.videoUrl, '高清直链已复制到剪贴板！')">
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        复制物理流直链
                      </button>
                    </div>
                  </div>

                  <!-- Tab 2: Copywriting Text -->
                  <div v-else-if="activeTab === 'copywriting'" class="tab-pane animate-fade-in">
                    <div v-if="isSummarizing" class="asr-loading-box">
                      <span class="asr-spinner"></span>
                      <p class="asr-loading-text">正在通过 ASR 语音识别转写文案，请稍候...</p>
                    </div>
                    <div v-else>
                      <div class="copywriting-box">
                        <p class="copy-text">{{ parseResult.description }}</p>
                        <button class="copy-box-btn" @click="copyUrl(parseResult.description, '视频文案已复制！')">
                          一键复制视频文案
                        </button>
                      </div>
                      <div class="copywriting-tip">
                        <span v-if="hasSummarized">✨ 该文案已由 ASR 服务从视频人声中实时转写提取。</span>
                        <span v-else>💡 提示：当前展示的为网页原始简介，启用 ASR 可以提取视频内说话的完整文案。</span>
                      </div>
                    </div>
                  </div>

                  <!-- Tab 3: AI Summary -->
                  <div v-else-if="activeTab === 'summary'" class="tab-pane animate-fade-in">
                    <div v-if="isSummarizing" class="asr-loading-box">
                      <span class="asr-spinner"></span>
                      <p class="asr-loading-text">正在读取人声字幕并请求大模型提炼核心看点，请稍候...</p>
                    </div>
                    <div v-else class="ai-summary-card">
                      <div class="ai-header">
                        <span class="ai-category-badge">📂 视频内容领域: {{ parseResult.aiSummary.category }}</span>
                        <span class="ai-tag" :class="{ 'real-ai': parseResult.aiSummary.isRealAI }">
                          {{ parseResult.aiSummary.isRealAI ? '✨ AI 核心深度提炼' : '💡 本地启发总结' }}
                        </span>
                      </div>
                      
                      <ul class="ai-points-list">
                        <li v-for="(point, idx) in parseResult.aiSummary.points" :key="idx" class="ai-point-item">
                          <span class="point-bullet"></span>
                          <span class="point-text">{{ point }}</span>
                        </li>
                      </ul>

                      <div class="ai-suggestion-box">
                        <div class="sugg-header">💡 极客智能建议：</div>
                        <p class="sugg-text">{{ parseResult.aiSummary.suggestion }}</p>
                      </div>

                      <div class="ai-settings-banner-tip" v-if="!parseResult.aiSummary.isRealAI">
                        💡 提示：当前为本地启发式总结。点击右上角设置配置并启用 AI 大模型与 ASR 识别可获得极速精准的 AI 提炼。
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>

    <!-- Footer -->
    <footer class="footer animate-fade-in">
      <p>仅供技术交流学习，请勿用于商业及非法用途</p>
      <p class="engine-status"><span class="pulse-indicator"></span> 引擎接口运行于: <code>{{ ENGINE_API_URL }}</code></p>
      <p class="credits" style="font-size: 0.95rem; font-weight: 700; background: linear-gradient(135deg, #a78bfa 0%, #f472b6 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0 2px 8px rgba(167, 139, 250, 0.3)); margin-top: 8px; letter-spacing: 1px;">⚡ Created & Designed by LBY</p>
    </footer>
  </div>
</template>
<style scoped>
.vidfetch-container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 60px 20px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  justify-content: center;
  position: relative;
  z-index: 1;
}

/* Interactive Canvas Particle Field */
.particle-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 0;
  pointer-events: none;
}

/* Background animated glow objects */
.glow-bg-node {
  position: fixed;
  width: 450px;
  height: 450px;
  border-radius: 50%;
  filter: blur(120px);
  z-index: -1;
  opacity: 0.15;
  pointer-events: none;
  animation: floatNode 25s infinite alternate ease-in-out;
}

.node-1 {
  background: var(--color-violet);
  top: -10%;
  left: -5%;
}

.node-2 {
  background: var(--color-fuchsia);
  bottom: -10%;
  right: -5%;
  animation-delay: -6s;
}

@keyframes floatNode {
  0% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(60px, 40px) scale(1.15); }
  100% { transform: translate(-40px, 60px) scale(0.9); }
}

/* Settings Overlay Modal */
.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(5, 5, 10, 0.7);
  backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-modal {
  background: rgba(15, 17, 33, 0.85);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(20px);
  border-radius: 20px;
  width: 90%;
  max-width: 440px;
  padding: 30px;
  box-shadow: 0 20px 50px rgba(0,0,0,0.6);
  position: relative;
  animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.settings-close {
  position: absolute;
  top: 20px;
  right: 20px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  transition: all 0.2s ease;
}

.settings-close:hover {
  color: var(--text-primary);
}

.settings-title {
  font-size: 1.3rem;
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-size: 0.88rem;
  color: var(--text-secondary);
  margin-bottom: 8px;
  font-weight: 600;
}

.form-input {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px;
  color: var(--text-primary);
  font-size: 0.95rem;
  outline: none;
  transition: all 0.2s ease;
}

.form-input:focus {
  border-color: var(--color-violet);
  box-shadow: 0 0 10px rgba(139, 92, 246, 0.2);
}

.form-tip {
  display: block;
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-top: 6px;
  line-height: 1.4;
}

.switch-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--border-color);
  padding: 12px;
  border-radius: 10px;
}

.switch-label-status {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.glow-checkbox {
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: var(--color-violet);
}

.settings-save-btn {
  width: 100%;
  background: var(--gradient-glow);
  color: white;
  border: none;
  border-radius: 10px;
  padding: 12px;
  font-weight: 700;
  cursor: pointer;
  margin-top: 10px;
  transition: all 0.2s ease;
}

.settings-save-btn:hover {
  box-shadow: 0 0 15px rgba(139, 92, 246, 0.4);
}

/* Custom Toast Alert Component */
.custom-toast {
  position: fixed;
  top: 30px;
  right: 30px;
  background: rgba(15, 17, 33, 0.85);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(15px);
  padding: 14px 24px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 9999;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  max-width: 320px;
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.custom-toast.success {
  border-left: 4px solid var(--color-emerald);
  color: var(--color-emerald);
}

.custom-toast.error {
  border-left: 4px solid var(--color-rose);
  color: var(--color-rose);
}

.toast-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
}

.toast-message {
  color: var(--text-primary);
  font-size: 0.95rem;
  font-weight: 600;
}

.toast-fade-enter-from {
  opacity: 0;
  transform: translateY(-20px) scale(0.9);
}
.toast-fade-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
}
.toast-fade-leave-from {
  opacity: 1;
}
.toast-fade-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

/* Header */
.hero-header {
  text-align: center;
  margin-bottom: 40px;
  position: relative;
  z-index: 10;
}

.logo-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  position: relative;
}

.logo-text {
  font-size: 3.5rem;
  font-weight: 800;
  letter-spacing: -2px;
  background: linear-gradient(135deg, #a78bfa 0%, #f472b6 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 4px 12px rgba(139, 92, 246, 0.2));
}

.badge-pro {
  background: var(--gradient-glow);
  color: white;
  font-size: 0.75rem;
  font-weight: 900;
  padding: 4px 8px;
  border-radius: 6px;
  letter-spacing: 1px;
  box-shadow: 0 0 12px rgba(217, 70, 239, 0.4);
}

.badge-author {
  background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
  color: white;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 4px 8px;
  border-radius: 6px;
  letter-spacing: 1px;
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.4);
}

.action-settings-btn {
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  width: 38px;
  height: 38px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  margin-left: 10px;
}

.action-settings-btn:hover {
  background: rgba(255,255,255,0.1);
  color: var(--text-primary);
  transform: rotate(30deg);
}

.gear-icon {
  width: 20px;
  height: 20px;
}

.subtitle {
  font-size: 1.1rem;
  color: var(--text-secondary);
  max-width: 600px;
  margin: 0 auto;
  line-height: 1.6;
}

/* Main Card */
.main-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(20px);
  border-radius: 24px;
  padding: 40px;
  box-shadow: 0 20px 40px rgba(0,0,0,0.3);
  margin-bottom: 40px;
  position: relative;
  z-index: 10;
}

/* Input Panel */
.input-panel {
  margin-bottom: 30px;
}

.input-glow-wrapper {
  display: flex;
  position: relative;
  border-radius: 16px;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  transition: all 0.3s ease;
  padding: 6px;
  align-items: center;
}

.input-glow-wrapper:focus-within {
  border-color: var(--color-violet);
  box-shadow: 0 0 20px var(--border-glow);
}

.glow-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 1.1rem;
  padding: 14px 20px;
}

.glow-input::placeholder {
  color: var(--text-muted);
}

.clear-btn {
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-muted);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 8px;
  transition: all 0.2s ease;
}

.clear-btn:hover {
  background: rgba(255,255,255,0.08);
  color: var(--text-primary);
}

.clear-btn svg {
  width: 18px;
  height: 18px;
}

.glow-button {
  background: var(--gradient-glow);
  border: none;
  outline: none;
  color: white;
  font-size: 1rem;
  font-weight: 700;
  height: 48px;
  padding: 0 32px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.glow-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 0 15px rgba(139, 92, 246, 0.4);
}

.glow-button:active {
  transform: translateY(1px);
}

.quick-examples {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  font-size: 0.9rem;
}

.quick-examples .label {
  color: var(--text-muted);
}

.ex-btn {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.05);
  color: var(--text-secondary);
  padding: 6px 14px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ex-btn:hover {
  background: rgba(255,255,255,0.1);
  color: var(--text-primary);
  border-color: rgba(255,255,255,0.1);
}

.plat-mini-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}

.plat-mini-dot.bilibili {
  background: #fb7299;
  box-shadow: 0 0 6px #fb7299;
}

.plat-mini-dot.douyin {
  background: #25f4ee;
  box-shadow: 0 0 6px #25f4ee;
}

.plat-mini-dot.xhs {
  background: #ff2442;
  box-shadow: 0 0 6px #ff2442;
}

.plat-mini-dot.youtube {
  background: #ff0000;
  box-shadow: 0 0 6px #ff0000;
}

/* Progress Panel */
.progress-panel {
  background: rgba(255, 255, 255, 0.01);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 24px;
  margin-top: 30px;
}

.stepper-title-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.stepper-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-violet);
}

/* loading wave animation */
.loading-wave {
  display: flex;
  gap: 3px;
}

.loading-wave span {
  width: 3px;
  height: 12px;
  background: var(--color-violet);
  border-radius: 2px;
  animation: wave 1.2s infinite ease-in-out;
}

.loading-wave span:nth-child(2) { animation-delay: 0.15s; }
.loading-wave span:nth-child(3) { animation-delay: 0.3s; }
.loading-wave span:nth-child(4) { animation-delay: 0.45s; }

@keyframes wave {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(2.2); }
}

.stepper-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 16px;
  opacity: 0.25;
  transition: all 0.3s ease;
}

.step-item.active {
  opacity: 1;
}

.step-item.completed {
  opacity: 0.7;
}

.step-indicator {
  width: 28px;
  height: 28px;
  border-radius: 50px;
  border: 2px solid var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 700;
  transition: all 0.3s ease;
  color: var(--text-muted);
}

.step-item.active .step-indicator {
  border-color: var(--color-violet);
  background: rgba(139, 92, 246, 0.15);
  color: var(--color-violet);
  box-shadow: 0 0 10px rgba(139, 92, 246, 0.3);
}

.step-item.completed .step-indicator {
  border-color: var(--color-emerald);
  background: var(--color-emerald);
  color: #05050a;
}

.check-svg {
  width: 14px;
  height: 14px;
}

.step-content {
  font-size: 0.95rem;
  font-weight: 500;
}

/* Error Banner */
.error-banner {
  background: rgba(244, 63, 94, 0.08);
  border: 1px solid rgba(244, 63, 94, 0.2);
  border-radius: 16px;
  padding: 16px 24px;
  margin-top: 30px;
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--color-rose);
}

/* Result Panel */
.result-panel {
  margin-top: 40px;
  border-top: 1px solid var(--border-color);
  padding-top: 40px;
}

.result-grid {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 40px;
}

.media-container-wrapper {
  perspective: 1000px;
}

.media-container {
  position: relative;
  border-radius: 18px;
  overflow: hidden;
  background: black;
  border: 1px solid var(--border-color);
  aspect-ratio: 9/16;
  max-height: 480px;
  box-shadow: 0 15px 35px rgba(0,0,0,0.6);
  transition: all 0.5s cubic-bezier(0.165, 0.84, 0.44, 1);
  transform-style: preserve-3d;
}

.media-container:hover {
  transform: rotateY(-3deg) rotateX(3deg) translateY(-5px);
  box-shadow: 0 20px 45px rgba(139, 92, 246, 0.25);
  border-color: rgba(139, 92, 246, 0.4);
}

.video-preview {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.badge-platform {
  position: absolute;
  top: 16px;
  left: 16px;
  padding: 6px 14px;
  border-radius: 30px;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.5px;
  z-index: 10;
  box-shadow: 0 4px 10px rgba(0,0,0,0.3);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.badge-icon {
  width: 16px;
  height: 16px;
}

.badge-platform.bilibili {
  background: #fb7299;
  color: white;
  box-shadow: 0 0 10px rgba(251, 114, 153, 0.4);
}

.badge-platform.douyin {
  background: linear-gradient(135deg, #25f4ee 0%, #fe2c55 100%);
  color: black;
  font-weight: 900;
}

.badge-platform.xhs {
  background: #ff2442;
  color: white;
  box-shadow: 0 0 10px rgba(255, 36, 66, 0.5);
}

.badge-platform.tiktok {
  background: #000000;
  color: white;
  border: 1px solid rgba(255,255,255,0.15);
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.8);
}

.badge-platform.youtube {
  background: #ff0000;
  color: white;
  box-shadow: 0 0 10px rgba(255, 0, 0, 0.5);
}

.meta-container {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.video-title {
  font-size: 1.4rem;
  font-weight: 700;
  line-height: 1.4;
  color: var(--text-primary);
  margin-bottom: 24px;
}

/* Bento Style Tabs Navigation */
.tabs-header {
  display: flex;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  padding: 4px;
  border-radius: 12px;
  gap: 4px;
  margin-bottom: 20px;
}

.tab-btn {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  padding: 10px 14px;
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.tab-btn:hover {
  color: var(--text-primary);
  background: rgba(255,255,255,0.03);
}

.tab-btn.active {
  background: rgba(139, 92, 246, 0.15);
  color: var(--color-violet);
  border: 1px solid rgba(139, 92, 246, 0.2);
}

.tabs-content {
  min-height: 220px;
}

/* Tab 2: Copywriting styling */
.copywriting-box {
  background: rgba(255,255,255,0.01);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 20px;
  position: relative;
  margin-bottom: 12px;
  max-height: 350px;
  overflow-y: auto;
}

.copy-text {
  font-size: 0.98rem;
  line-height: 1.7;
  color: var(--text-primary);
  margin-bottom: 20px;
  word-break: break-all;
  white-space: pre-wrap;
}

.copy-box-btn {
  background: var(--gradient-glow);
  color: white;
  border: none;
  outline: none;
  font-size: 0.9rem;
  font-weight: 700;
  padding: 10px 20px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.copy-box-btn:hover {
  box-shadow: 0 0 12px rgba(139, 92, 246, 0.4);
  transform: translateY(-1px);
}

.copywriting-tip {
  font-size: 0.85rem;
  color: var(--text-muted);
}

/* Tab 3: AI Summary Card */
.ai-summary-card {
  background: rgba(255, 255, 255, 0.01);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 20px;
}

.ai-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
  margin-bottom: 16px;
}

.ai-category-badge {
  font-size: 0.9rem;
  font-weight: 800;
  color: var(--color-emerald);
}

.ai-tag {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
}

.ai-tag.real-ai {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.3);
  color: var(--color-emerald);
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.2);
}

.ai-points-list {
  list-style: none;
  padding: 0;
  margin: 0 0 20px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-point-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.point-bullet {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-violet);
  box-shadow: 0 0 6px var(--color-violet);
  margin-top: 8px;
  flex-shrink: 0;
}

.point-text {
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--text-secondary);
}

.ai-suggestion-box {
  background: rgba(16, 185, 129, 0.05);
  border: 1px solid rgba(16, 185, 129, 0.15);
  border-radius: 10px;
  padding: 14px;
}

.sugg-header {
  font-size: 0.88rem;
  font-weight: 800;
  color: var(--color-emerald);
  margin-bottom: 6px;
}

.sugg-text {
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--text-secondary);
}

.ai-settings-banner-tip {
  background: rgba(255,255,255,0.02);
  border: 1px dashed var(--border-color);
  border-radius: 10px;
  padding: 12px;
  margin-top: 16px;
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.4;
}

/* Diagnostic Metrics Grid */
.diagnostic-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.diag-item {
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.04);
  border-radius: 12px;
  padding: 12px;
  text-align: center;
}

.diag-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 4px;
  font-weight: 600;
}

.diag-value {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-secondary);
}

.diag-value.highlight {
  color: var(--color-emerald);
}

.meta-info {
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 24px;
}

.info-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-label {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-weight: 600;
}

.info-link {
  color: var(--color-violet);
  text-decoration: none;
  font-size: 0.9rem;
  word-break: break-all;
  transition: all 0.2s ease;
}

.info-link:hover {
  text-decoration: underline;
  color: #a78bfa;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px 24px;
  border-radius: 14px;
  font-size: 1rem;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.download-btn {
  background: var(--gradient-emerald);
  color: white;
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.2);
}

.download-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
}

.copy-btn {
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
}

.copy-btn:hover {
  background: rgba(255,255,255,0.08);
}

.icon {
  width: 18px;
  height: 18px;
}

/* Animations */
.animate-bounce-y {
  animation: bounceY 2s infinite;
}

@keyframes bounceY {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

/* Footer */
.footer {
  text-align: center;
  font-size: 0.85rem;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: auto;
  position: relative;
  z-index: 10;
}

.engine-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.pulse-indicator {
  width: 8px;
  height: 8px;
  border-radius: 10px;
  background: var(--color-emerald);
  box-shadow: 0 0 8px var(--color-emerald);
  display: inline-block;
  animation: pulse 2s infinite;
}

/* Animations */
.animate-fade-in {
  animation: fadeIn 0.8s ease forwards;
}

.animate-slide-up {
  animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.animate-shake {
  animation: shake 0.4s ease forwards;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  75% { transform: translateX(6px); }
}

@keyframes pulse {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

/* Spinner */
.spinner {
  width: 20px;
  height: 20px;
  border: 3px solid rgba(255,255,255,0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 1s ease-in-out infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Responsive */
@media (max-width: 768px) {
  .result-grid {
    grid-template-columns: 1fr;
    gap: 30px;
  }
  .media-container {
    aspect-ratio: 16/9;
    max-height: 240px;
  }
  .diagnostic-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }
}

/* ASR Asynchronous Loading Box */
.asr-loading-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  background: rgba(15, 17, 33, 0.4);
  border: 1px dashed var(--border-color);
  border-radius: 12px;
  text-align: center;
}

.asr-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(139, 92, 246, 0.2);
  border-radius: 50%;
  border-top-color: var(--color-violet);
  animation: spin 0.8s cubic-bezier(0.5, 0.1, 0.4, 0.9) infinite;
  margin-bottom: 16px;
}

.asr-loading-text {
  font-size: 0.9rem;
  color: var(--text-muted);
  line-height: 1.6;
}

/* ==================== 登录、账户管理与审计样式 ==================== */

/* Auth Overlay */
.auth-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(5, 5, 10, 0.85);
  backdrop-filter: blur(12px);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.auth-card {
  background: rgba(15, 17, 33, 0.85);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(20px);
  border-radius: 24px;
  width: 90%;
  max-width: 420px;
  padding: 40px;
  box-shadow: 0 30px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(139, 92, 246, 0.1);
  text-align: center;
  position: relative;
}

.auth-logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  justify-content: center;
}

.auth-subtitle {
  font-size: 0.95rem;
  color: var(--text-secondary);
  margin-bottom: 30px;
}

.auth-tabs {
  display: flex;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 4px;
  gap: 4px;
  margin-bottom: 24px;
}

.auth-tab-btn {
  flex: 1;
  background: transparent;
  border: none;
  padding: 10px;
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.auth-tab-btn:hover {
  color: var(--text-primary);
}

.auth-tab-btn.active {
  background: rgba(139, 92, 246, 0.15);
  color: var(--color-violet);
  border: 1px solid rgba(139, 92, 246, 0.2);
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
}

.auth-submit-btn {
  background: var(--gradient-glow);
  color: white;
  border: none;
  border-radius: 12px;
  padding: 14px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: 10px;
  width: 100%;
}

.auth-submit-btn:hover {
  box-shadow: 0 0 20px rgba(139, 92, 246, 0.5);
  transform: translateY(-1px);
}

/* Top Nav User profile */
.top-nav-bar {
  position: absolute;
  top: 24px;
  right: 24px;
  z-index: 999;
}

.nav-user-profile {
  background: rgba(15, 17, 33, 0.7);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(10px);
  padding: 6px 14px 6px 6px;
  border-radius: 30px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
  user-select: none;
}

.nav-user-profile:hover {
  background: rgba(15, 17, 33, 0.9);
  border-color: rgba(139, 92, 246, 0.3);
}

.nav-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
}

.nav-nickname {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary);
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-role-badge {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
}

.nav-role-badge.admin {
  background: rgba(244, 63, 94, 0.15);
  color: var(--color-rose);
  border: 1px solid rgba(244, 63, 94, 0.2);
}

.nav-role-badge.super {
  background: rgba(217, 70, 239, 0.15);
  color: var(--color-fuchsia);
  border: 1px solid rgba(217, 70, 239, 0.2);
}

.nav-role-badge.user {
  background: rgba(16, 185, 129, 0.15);
  color: var(--color-emerald);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.dropdown-chevron {
  width: 16px;
  height: 16px;
  color: var(--text-muted);
}

/* Profile Dropdown Menu */
.profile-dropdown-menu {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  background: rgba(15, 17, 33, 0.95);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  width: 220px;
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.5);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  animation: slideUp 0.2s ease forwards;
}

.dropdown-header {
  padding: 12px 16px;
  text-align: left;
}

.dropdown-nickname {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-primary);
  word-break: break-all;
}

.dropdown-username {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.dropdown-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 0;
}

.dropdown-item {
  background: transparent;
  border: none;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 0.88rem;
  color: var(--text-secondary);
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
  width: 100%;
  text-align: left;
}

.dropdown-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.dropdown-item.logout:hover {
  background: rgba(244, 63, 94, 0.1);
  color: var(--color-rose);
}

/* User Limit/Usage Progress Bar in Card */
.usage-banner {
  background: rgba(15, 17, 33, 0.5);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 16px 20px;
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: left;
}

.usage-banner.warning {
  border-color: rgba(244, 63, 94, 0.25);
  background: rgba(244, 63, 94, 0.03);
}

.usage-info {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-secondary);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.usage-info strong {
  color: var(--color-emerald);
}

.usage-banner.warning .usage-info {
  color: var(--color-rose);
}

.usage-progress {
  height: 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
  overflow: hidden;
}

.usage-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--color-emerald) 0%, #34d399 100%);
  border-radius: 3px;
  transition: width 0.4s ease;
}

.usage-banner.warning .usage-bar {
  background: var(--color-rose);
}

/* Input block overlay when limit reached */
.input-glow-wrapper.disabled {
  border-color: rgba(244, 63, 94, 0.3) !important;
  box-shadow: none !important;
  opacity: 0.6;
}

.glow-button.disabled {
  background: rgba(255, 255, 255, 0.05) !important;
  color: var(--text-muted) !important;
  cursor: not-allowed !important;
  box-shadow: none !important;
}

/* Admin Dashboard Modal Styling */
.admin-dashboard-modal {
  max-width: 800px !important;
  width: 95% !important;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.admin-tabs {
  display: flex;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
  padding: 4px;
  border-radius: 12px;
  gap: 6px;
  margin-bottom: 20px;
}

.admin-tab-btn {
  flex: 1;
  background: transparent;
  border: none;
  padding: 12px;
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.admin-tab-btn:hover {
  color: var(--text-primary);
}

.admin-tab-btn.active {
  background: rgba(139, 92, 246, 0.15);
  color: var(--color-violet);
  border: 1px solid rgba(139, 92, 246, 0.2);
}

.admin-pane {
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.create-user-toggle-btn {
  background: rgba(139, 92, 246, 0.15);
  color: var(--color-violet);
  border: 1px dashed rgba(139, 92, 246, 0.4);
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.create-user-toggle-btn:hover {
  background: rgba(139, 92, 246, 0.25);
  border-style: solid;
}

.table-container {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  background: rgba(10, 11, 22, 0.4);
}

.logs-table-container {
  max-height: 400px;
  overflow-y: auto;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.88rem;
}

.admin-table th {
  background: rgba(255, 255, 255, 0.02);
  color: var(--text-secondary);
  font-weight: 600;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.85rem;
}

.admin-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
  vertical-align: middle;
}

.admin-table tr:last-child td {
  border-bottom: none;
}

.admin-table tr:hover td {
  background: rgba(255, 255, 255, 0.01);
  color: var(--text-primary);
}

.role-badge {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 6px;
  display: inline-block;
}

.role-badge.admin {
  background: rgba(244, 63, 94, 0.15);
  color: var(--color-rose);
  border: 1px solid rgba(244, 63, 94, 0.2);
}

.role-badge.super {
  background: rgba(217, 70, 239, 0.15);
  color: var(--color-fuchsia);
  border: 1px solid rgba(217, 70, 239, 0.2);
}

.role-badge.user {
  background: rgba(16, 185, 129, 0.15);
  color: var(--color-emerald);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.role-badge-mini {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  margin-left: 6px;
  text-transform: uppercase;
}

.role-badge-mini.admin {
  background: rgba(244, 63, 94, 0.1);
  color: var(--color-rose);
}

.role-badge-mini.super {
  background: rgba(217, 70, 239, 0.1);
  color: var(--color-fuchsia);
}

.role-badge-mini.user {
  background: rgba(16, 185, 129, 0.1);
  color: var(--color-emerald);
}

.delete-user-btn {
  background: rgba(244, 63, 94, 0.15);
  color: var(--color-rose);
  border: 1px solid rgba(244, 63, 94, 0.2);
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 700;
  transition: all 0.2s ease;
}

.delete-user-btn:hover {
  background: var(--color-rose);
  color: white;
}

.log-time-cell {
  font-family: var(--font-mono);
  color: var(--text-muted);
  font-size: 0.8rem;
}

.log-url-cell {
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-url-link {
  color: var(--color-violet);
  text-decoration: none;
  transition: all 0.2s ease;
}

.log-url-link:hover {
  text-decoration: underline;
  color: #a78bfa;
}

/* Responsive top bar adjustment */
@media (max-width: 768px) {
  .top-nav-bar {
    position: static;
    margin-bottom: 20px;
    display: flex;
    justify-content: center;
  }
}

/* ==================== 子页面与返回按钮样式 ==================== */

.page-header {
  display: flex;
  align-items: center;
  gap: 20px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 20px;
  margin-bottom: 24px;
  text-align: left;
}

.back-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 8px 16px;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.back-btn:hover {
  background: rgba(139, 92, 246, 0.15);
  color: var(--color-violet);
  border-color: rgba(139, 92, 246, 0.3);
  transform: translateX(-2px);
}

.back-icon {
  width: 16px;
  height: 16px;
}

.page-title {
  font-size: 1.3rem;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0;
}

.sub-page {
  text-align: left;
}

.settings-page-content {
  margin-top: 20px;
}
</style>
