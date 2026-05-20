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

// 外网访问密钥配置
const showAccessKeyModal = ref(false)
const tempAccessKey = ref('')
const accessKey = ref(sessionStorage.getItem('accessKey') || '')

// Canvas 粒子背景引用
const canvasRef = ref(null)
let animationId = null

// 初始化 Canvas 交互星空粒子网格
onMounted(() => {
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

// 保存豆包 API 设置
const saveSettings = () => {
  localStorage.setItem('doubaoApiKey', doubaoApiKey.value)
  localStorage.setItem('doubaoEndpointId', doubaoEndpointId.value)
  localStorage.setItem('enableDoubao', enableDoubao.value ? 'true' : 'false')
  showSettings.value = false
  showToast('豆包 AI 配置已成功保存！', 'success')
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

const handleParse = async () => {
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
  const startTime = performance.now()
  startProgress()

  try {
    const res = await fetch(`${ENGINE_API_URL}/api/parse`, {
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
      aiSummary: data.aiSummary || {
        category: '综合创作',
        points: ['成功解析视频文件，视频链接通畅。', '视频各项元数据抓取完整。'],
        suggestion: '建议直接播放预览，或直接下载保存。',
        isRealAI: false
      }
    }
    showToast(parseResult.value.aiSummary.isRealAI ? '🎉 豆包 AI 字幕转写总结成功！' : '视频流及文案提取成功！', 'success')
  } catch (err) {
    errorMsg.value = err.message || '网络连接失败，请确保本地后端已启动！'
    showToast('解析失败，请查看报错信息', 'error')
  } finally {
    isParsing.value = false
    stopProgress()
  }
}

// 平台类映射计算
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

// 清除输入框
const clearInput = () => {
  inputUrl.value = ''
}

// 代理播放 URL（含 Title 以支持原名下载）
const proxyVideoUrl = computed(() => {
  if (!parseResult.value) return ''
  return `${ENGINE_API_URL}/api/download?videoUrl=${encodeURIComponent(parseResult.value.videoUrl)}&referer=${encodeURIComponent(parseResult.value.targetUrl)}&title=${encodeURIComponent(parseResult.value.title)}&accessKey=${encodeURIComponent(accessKey.value)}`
})

// 复制链接
const copyUrl = (url, msg = '高清直链已复制到剪贴板！') => {
  navigator.clipboard.writeText(url)
  showToast(msg, 'success')
}

// 快速输入样例
const fillExample = (url) => {
  inputUrl.value = url
  showToast('已载入示例链接，按 Enter 开始', 'success')
}
</script>

<template>
  <div class="vidfetch-container">
    <!-- Interactive Canvas Particle Field -->
    <canvas ref="canvasRef" class="particle-canvas"></canvas>

    <!-- Ambient Background Glow Objects -->
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

    <!-- Settings Overlay Modal (Doubao API) -->
    <Transition name="toast-fade">
      <div v-if="showSettings" class="settings-overlay" @click.self="showSettings = false">
        <div class="settings-modal">
          <button class="settings-close" @click="showSettings = false">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <h3 class="settings-title">⚙️ 豆包 AI 大模型配置</h3>
          
          <div class="form-group">
            <label class="form-label">启用豆包深度总结 & 文案提炼</label>
            <div class="switch-group">
              <span class="switch-label-status">{{ enableDoubao ? '已开启 (解析时将调用豆包 API)' : '未开启 (默认采用本地启发式总结)' }}</span>
              <input type="checkbox" v-model="enableDoubao" class="glow-checkbox" />
            </div>
          </div>

          <div class="form-group" v-if="enableDoubao">
            <label class="form-label">火山引擎 API Key</label>
            <input type="password" v-model="doubaoApiKey" placeholder="输入火山引擎以 Bearer 开头的 API Key" class="form-input" />
          </div>

          <div class="form-group" v-if="enableDoubao">
            <label class="form-label">接入点 Endpoint ID</label>
            <input type="text" v-model="doubaoEndpointId" placeholder="例如: ep-202409xxxx-xxxx" class="form-input" />
            <span class="form-tip">提示：使用标准 OpenAI 格式，在火山引擎 Ark 控制台部署豆包模型获取。</span>
          </div>

          <button class="settings-save-btn" @click="saveSettings">保存并生效</button>
        </div>
      </div>
    </Transition>

    <!-- Access Key Modal (for Overseas Platforms) -->
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

    <!-- Header -->
    <header class="hero-header animate-fade-in">
      <div class="logo-wrapper">
        <span class="logo-text">VidFetch</span>
        <span class="badge-pro">ULTRA</span>
        <span class="badge-author">BY LBY</span>
        <!-- Settings Gear Button -->
        <button class="action-settings-btn" @click="showSettings = true" title="AI 配置">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="gear-icon"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
      <p class="subtitle">全面支持抖音、B站、小红书、TikTok、YouTube，已深度接入 B站语音字幕转写及豆包 LLM 大模型！</p>
    </header>

    <!-- Main Card -->
    <main class="main-card animate-slide-up">
      <!-- Input Panel -->
      <section class="input-panel">
        <div class="input-glow-wrapper">
          <input 
            type="text" 
            v-model="inputUrl" 
            placeholder="粘贴抖音、B站、小红书、TikTok、YouTube等链接或分享口令..." 
            class="glow-input"
            @keyup.enter="handleParse"
            :disabled="isParsing"
          />
          <!-- Clear Button -->
          <button v-if="inputUrl && !isParsing" class="clear-btn" @click="clearInput">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <button 
            @click="handleParse" 
            :disabled="isParsing" 
            class="glow-button"
            :class="{ 'loading': isParsing }"
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
                  @click="activeTab = 'video'"
                >
                  🎥 视频下载
                </button>
                <button 
                  class="tab-btn" 
                  :class="{ 'active': activeTab === 'copywriting' }"
                  @click="activeTab = 'copywriting'"
                >
                  ✍️ 提取文案
                </button>
                <button 
                  class="tab-btn" 
                  :class="{ 'active': activeTab === 'summary' }"
                  @click="activeTab = 'summary'"
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
                  <div class="copywriting-box">
                    <p class="copy-text">{{ parseResult.description }}</p>
                    <button class="copy-box-btn" @click="copyUrl(parseResult.description, '视频文案已复制！')">
                      一键复制视频文案
                    </button>
                  </div>
                  <div class="copywriting-tip">
                    <span v-if="parseResult.aiSummary.isRealAI">✨ 该文案已由豆包 AI 根据原视频语音转写字幕进行润色扩展。</span>
                    <span v-else>💡 提示：当前使用网页原始文案，点击右上角 ⚙️ 配置豆包 API 可结合视频语音字幕重组高级文案！</span>
                  </div>
                </div>

                <!-- Tab 3: AI Summary -->
                <div v-else-if="activeTab === 'summary'" class="tab-pane animate-fade-in">
                  <div class="ai-summary-card">
                    <div class="ai-header">
                      <span class="ai-category-badge">📂 视频内容领域: {{ parseResult.aiSummary.category }}</span>
                      <span class="ai-tag" :class="{ 'real-ai': parseResult.aiSummary.isRealAI }">
                        {{ parseResult.aiSummary.isRealAI ? '✨ 豆包 AI 深度提炼' : '💡 本地预设总结' }}
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
                      💡 想要实现真实视频语音字幕提取和精准深度总结？请点击右上角 ⚙️ 配置豆包大模型！
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

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
</style>
