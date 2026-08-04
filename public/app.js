/* ──────────────────────────────────────────────
   HotPot — Frontend Application Logic
   ────────────────────────────────────────────── */

// ── State ──────────────────────────────────────
const LAZY_PAGE_SIZE = 30;

const state = {
    activePlatform: 'bilibili',
    activeCategory: 'all',
    activeTimeRange: 'all',
    searchQuery: '',
    searchPage: 1,
    displayLimit: LAZY_PAGE_SIZE,
    isMoreLoading: false,
    hasMore: true,
    videoList: [],
    selectedVideo: null,
    requestSequence: 0,
    parseSequence: 0,
    activeView: 'feed',
    globe: null,
    globeResizeObserver: null,
    geoSignals: [],
    geoSignalKey: '',
    geoSignalSequence: 0,
    geoAbortController: null,
    listAbortController: null,
    settings: { proxy: '' },
    currentUser: null,
    token: localStorage.getItem('hotpot_token') || ''
};

// ── Platform Themes ────────────────────────────
const platformThemes = {
    bilibili: {
        title: '哔哩哔哩',
        desc: '实时监控B站全站及分区首发爆款榜单，一键拆解流量密码',
        accent: '#ff6699',
        glow: 'rgba(255,102,153,0.22)'
    },
    douyin: {
        title: '抖音热点榜',
        desc: '实时同步抖音热搜话题与热度指数，点击话题直通相关解析视频',
        accent: '#00f2fe',
        glow: 'rgba(0,242,254,0.20)'
    },
    youtube: {
        title: 'YouTube Trending',
        desc: '追踪全球最大视频平台的最新趋势（需开启科学上网代理）',
        accent: '#ff3344',
        glow: 'rgba(255,51,68,0.22)'
    },
    tiktok: {
        title: 'TikTok Explore',
        desc: '直击海外短视频最热流行风向，抓取爆火内容（需代理）',
        accent: '#00f2fe',
        glow: 'rgba(0,242,254,0.20)'
    },
    twitter: {
        title: 'Twitter / X Trends',
        desc: '获取X平台全球最新热门话题排行，洞悉突发国际焦点（需代理）',
        accent: '#e2e8f0',
        glow: 'rgba(226,232,240,0.15)'
    },
    xiaohongshu: {
        title: '小红书热点',
        desc: '抓取小红书热门内容与种草爆款视频，挖掘笔记流量密码',
        accent: '#ff2442',
        glow: 'rgba(255,36,66,0.22)'
    },
    kuaishou: {
        title: '快手热门榜',
        desc: '实时同步快手老铁社区最火爆的热门榜单视频',
        accent: '#ff5000',
        glow: 'rgba(255,80,0,0.22)'
    }
};

// ── DOM Cache ─────────────────────────────────
const el = {
    navButtons:        document.querySelectorAll('.nav-btn'),
    filterChips:       document.querySelectorAll('.filter-chip'),
    timeChips:         document.querySelectorAll('.time-chip'),
    viewSwitchButtons: document.querySelectorAll('.view-switch-btn'),
    platformTitle:     document.getElementById('platform-title'),
    platformDesc:      document.getElementById('platform-desc'),
    refreshBtn:        document.getElementById('refresh-btn'),
    loader:            document.getElementById('loader'),
    emptyState:        document.getElementById('empty-state'),
    cardsGrid:         document.getElementById('cards-grid'),
    filtersContainer:  document.getElementById('category-filters-container'),
    gridScrollArea:    document.getElementById('grid-scroll-area'),
    infiniteLoader:    document.getElementById('infinite-loader'),
    endHint:           document.getElementById('end-hint'),
    endHintText:       document.getElementById('end-hint-text'),
    globeView:         document.getElementById('globe-view'),
    globeStage:        document.getElementById('globe-stage'),
    globeEmpty:        document.getElementById('globe-empty'),
    hotspotList:       document.getElementById('hotspot-list'),
    geoCityCount:      document.getElementById('geo-city-count'),
    geoVideoCount:     document.getElementById('geo-video-count'),
    geoCoverage:       document.getElementById('geo-coverage'),
    // Search Bar
    searchInput:       document.getElementById('search-input'),
    searchBtn:         document.getElementById('search-btn'),
    // Drawer
    detailDrawer:      document.getElementById('detail-drawer'),
    closeDrawerBtn:    document.getElementById('close-drawer-btn'),
    videoPlayerWrapper:document.getElementById('video-player-wrapper'),
    drawerPlatformBadge:document.getElementById('drawer-platform-badge'),
    drawerVideoTitle:  document.getElementById('drawer-video-title'),
    drawerAuthorAvatar:document.getElementById('drawer-author-avatar'),
    drawerAuthorName:  document.getElementById('drawer-author-name'),
    btnCopyLink:       document.getElementById('btn-copy-link'),
    btnParseStream:    document.getElementById('btn-parse-stream'),
    btnDownloadVideo:  document.getElementById('btn-download-video'),
    streamUrlBox:      document.getElementById('stream-url-box'),
    streamUrlInput:    document.getElementById('stream-url-input'),
    btnCopyStream:     document.getElementById('btn-copy-stream'),
    aiCategoryBadge:   document.getElementById('ai-category-badge'),
    aiHighlightsList:  document.getElementById('ai-highlights-list'),
    aiRecommendText:   document.getElementById('ai-recommendation-text'),
    // Settings modal
    settingsBtn:       document.getElementById('settings-btn'),
    settingsModal:     document.getElementById('settings-modal'),
    closeModalBtn:     document.getElementById('close-modal-btn'),
    settingProxy:      document.getElementById('setting-proxy'),
    proxyStatus:       document.getElementById('proxy-status'),
    btnSaveSettings:   document.getElementById('btn-save-settings'),
    // Popup player modal
    playerModal:       document.getElementById('player-modal'),
    closePlayerModal:  document.getElementById('close-player-modal-btn'),
    modalVideoWrapper: document.getElementById('modal-video-wrapper'),
    modalVideoTitle:   document.getElementById('modal-video-title'),
    modalVideoAuthor:  document.getElementById('modal-video-author'),
};

// ── Init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    bindEvents();
    fetchTrends();
});

// ── Settings ──────────────────────────────────
async function loadSettings() {
    try {
        const res  = await fetch('/api/settings');
        const data = await res.json();
        if (data.success) {
            state.settings.proxy = data.proxy;
            el.settingProxy.value = data.proxy;
            updateProxyBadge(data.status);
        }
    } catch (e) { console.error('Settings load failed:', e); }
}

function updateProxyBadge(status) {
    if (status === 'Connected') {
        el.proxyStatus.textContent = '已连接本地代理';
        el.proxyStatus.className = 'proxy-status-badge active';
    } else {
        el.proxyStatus.textContent = '未连接（海外平台可能失败）';
        el.proxyStatus.className = 'proxy-status-badge inactive';
    }
}

async function saveSettings() {
    const proxy = el.settingProxy.value.trim();
    try {
        const res  = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ proxy })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || '代理配置保存失败');
        if (data.success) {
            state.settings.proxy = data.proxy;
            showToast('代理配置保存成功！');
            el.settingsModal.classList.add('hidden');
            loadSettings();
        }
    } catch (e) { showToast(e.message || '保存失败，请检查后端状态。'); }
}

// ── Event Binding ─────────────────────────────
function bindEvents() {
    // Platform nav
    el.navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            el.navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const platform = btn.dataset.platform;
            state.activePlatform = platform;
            state.activeCategory = 'all';
            state.searchQuery = '';
            el.searchInput.value = '';

            const theme = platformThemes[platform];
            applyTheme(theme);

            el.platformTitle.textContent = theme.title;
            el.platformDesc.textContent  = theme.desc;

            // Categories are now visible for all platforms
            el.filtersContainer.classList.remove('hidden');
            el.filterChips.forEach(c => {
                c.classList.toggle('active', c.dataset.category === 'all');
            });

            closeDrawer();
            fetchTrends();
        });
    });

    // Category filters
    el.filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            el.filterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            state.activeCategory = chip.dataset.category;
            fetchTrends();
        });
    });

    // Time filters
    el.timeChips.forEach(chip => {
        chip.addEventListener('click', () => {
            el.timeChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            state.activeTimeRange = chip.dataset.time;
            fetchTrends();
        });
    });

    el.viewSwitchButtons.forEach(button => {
        button.addEventListener('click', () => setActiveView(button.dataset.view));
    });

    // Search Actions
    const performSearch = () => {
        const query = el.searchInput.value.trim();
        if (!query) {
            state.searchQuery = '';
            state.activeCategory = 'all';
            el.filterChips.forEach(c => {
                c.classList.toggle('active', c.dataset.category === 'all');
            });
            fetchTrends();
            return;
        }
        state.searchQuery = query;
        fetchTrends();
    };

    el.searchBtn.addEventListener('click', performSearch);
    el.searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') performSearch();
    });

    // Refresh
    el.refreshBtn.addEventListener('click', () => fetchTrends(true));

    // Drawer close
    el.closeDrawerBtn.addEventListener('click', closeDrawer);

    // Copy original link
    el.btnCopyLink.addEventListener('click', async () => {
        if (!state.selectedVideo) return;
        await copyText(state.selectedVideo.url, '原链接已复制！');
    });

    // Parse stream
    el.btnParseStream.addEventListener('click', parseVideoLink);

    // Copy stream URL
    el.btnCopyStream.addEventListener('click', async () => {
        const url = el.streamUrlInput.value;
        if (url) await copyText(url, '直链地址已复制！');
    });

    // Settings modal
    el.settingsBtn.addEventListener('click', () => el.settingsModal.classList.remove('hidden'));
    el.closeModalBtn.addEventListener('click', () => el.settingsModal.classList.add('hidden'));
    el.settingsModal.addEventListener('click', e => {
        if (e.target === el.settingsModal) el.settingsModal.classList.add('hidden');
    });
    el.btnSaveSettings.addEventListener('click', saveSettings);

    // Popup player modal close
    el.closePlayerModal.addEventListener('click', closePlayerModal);
    el.playerModal.addEventListener('click', e => {
        if (e.target === el.playerModal) closePlayerModal();
    });

    // Keyboard ESC
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (!el.playerModal.classList.contains('hidden')) {
                closePlayerModal();
            } else if (!el.settingsModal.classList.contains('hidden')) {
                el.settingsModal.classList.add('hidden');
            } else {
                closeDrawer();
            }
        }
    });

    // Scroll container scroll listener for infinite load
    el.gridScrollArea.addEventListener('scroll', () => {
        if (state.isMoreLoading || !state.hasMore) return;

        const { scrollTop, scrollHeight, clientHeight } = el.gridScrollArea;
        // Trigger load when within 80px of bottom
        if (scrollHeight - scrollTop - clientHeight < 80) {
            if (state.searchQuery) {
                loadMoreSearch();
            } else {
                loadMoreTrendsLocal();
            }
        }
    });
}

function applyTheme(theme) {
    const root = document.documentElement;
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--glow',   theme.glow);
}

function setActiveView(view) {
    if (!['feed', 'globe'].includes(view)) return;
    state.activeView = view;
    el.viewSwitchButtons.forEach(button => {
        button.classList.toggle('active', button.dataset.view === view);
    });

    const showGlobe = view === 'globe';
    el.globeView.classList.toggle('hidden', !showGlobe);
    el.gridScrollArea.classList.toggle('hidden', showGlobe);
    if (showGlobe) {
        initGlobe();
        updateGlobeFromVideos();
        loadGeoHotspots();
    } else if (state.videoList.length > 0) {
        hideLoader();
    }
}

function initGlobe() {
    if (state.globe || typeof Globe !== 'function') {
        if (typeof Globe !== 'function') {
            el.globeEmpty.classList.remove('hidden');
            el.globeEmpty.querySelector('h3').textContent = '3D 地球引擎加载失败';
        }
        return;
    }

    try {
        state.globe = Globe()(el.globeStage)
            .globeImageUrl('/vendor/earth-dark.jpg')
            .backgroundImageUrl('/vendor/night-sky.png')
            .backgroundColor('#030509')
            .showAtmosphere(true)
            .atmosphereColor('#2dd4bf')
            .atmosphereAltitude(0.12)
            .pointLat('lat')
            .pointLng('lng')
            .pointAltitude(d => 0.015 + d.intensity * 0.07)
            .pointRadius(d => 0.18 + d.intensity * 0.52)
            .pointColor('color')
            .pointResolution(18)
            .pointsMerge(false)
            .pointLabel(d => `
                <div class="globe-point-label">
                    <strong>${escapeHtml(d.city)}</strong> · ${escapeHtml(d.country)}
                    <span>${d.count} 条视频 · 总热度 ${formatCompactNumber(d.totalHeat)}</span>
                </div>
            `)
            .onPointClick(point => focusHotspot(point))
            .ringsData([])
            .ringLat('lat')
            .ringLng('lng')
            .ringColor(d => () => d.color)
            .ringMaxRadius(d => 1.2 + d.intensity * 2.8)
            .ringPropagationSpeed(d => 0.45 + d.intensity * 0.8)
            .ringRepeatPeriod(d => 900 + (1 - d.intensity) * 900);

        state.globe.pointOfView({ lat: 27, lng: 108, altitude: 2.15 }, 0);
        const controls = state.globe.controls();
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.28;
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;

        const resize = () => {
            if (!state.globe || !el.globeStage.clientWidth || !el.globeStage.clientHeight) return;
            state.globe.width(el.globeStage.clientWidth).height(el.globeStage.clientHeight);
        };
        state.globeResizeObserver = new ResizeObserver(resize);
        state.globeResizeObserver.observe(el.globeStage);
        requestAnimationFrame(resize);
    } catch (error) {
        console.error('Globe initialization failed:', error);
        el.globeEmpty.classList.remove('hidden');
        el.globeEmpty.querySelector('h3').textContent = '当前浏览器无法初始化 WebGL 地球';
    }
}

function aggregateVideoHotspots(videos) {
    const byCity = new Map();
    let locatedVideos = 0;

    videos.forEach(video => {
        if (!video.geo || !Number.isFinite(Number(video.geo.lat)) || !Number.isFinite(Number(video.geo.lng))) return;
        locatedVideos += 1;
        const key = `${video.geo.country}:${video.geo.city}`;
        const hotspot = byCity.get(key) || {
            city: video.geo.city,
            country: video.geo.country,
            lat: Number(video.geo.lat),
            lng: Number(video.geo.lng),
            count: 0,
            totalHeat: 0,
            videos: []
        };
        hotspot.count += 1;
        hotspot.totalHeat += Number(video.playRaw || 0);
        if (hotspot.videos.length < 3) hotspot.videos.push(video.title);
        byCity.set(key, hotspot);
    });

    const hotspots = [...byCity.values()].sort((a, b) =>
        b.count - a.count || b.totalHeat - a.totalHeat
    );
    const maxCount = Math.max(1, ...hotspots.map(item => item.count));
    hotspots.forEach(item => {
        item.intensity = Math.sqrt(item.count / maxCount);
        item.color = item.intensity >= 0.72
            ? '#fb3f6c'
            : (item.intensity >= 0.42 ? '#facc15' : '#22d3ee');
    });
    return { hotspots, locatedVideos };
}

function getGeoFilterKey() {
    return JSON.stringify({
        platform: state.activePlatform,
        category: state.activeCategory || 'all',
        timeRange: state.activeTimeRange,
        query: state.searchQuery
    });
}

function normalizeHotspotIntensity(hotspots) {
    const counts = hotspots.map(item => Number(item.count || 0));
    const heats = hotspots.map(item => Number(item.totalHeat || 0));
    const minCount = Math.min(...counts, 0);
    const maxCount = Math.max(1, ...counts);
    const minHeat = Math.min(...heats, 0);
    const maxHeat = Math.max(1, ...heats);
    const countSpread = maxCount - minCount;
    const heatSpread = maxHeat - minHeat;
    return hotspots.map(item => {
        const countScore = countSpread
            ? (Number(item.count || 0) - minCount) / countSpread
            : 1;
        const heatScore = heatSpread
            ? (Number(item.totalHeat || 0) - minHeat) / heatSpread
            : countScore;
        // 搜索索引量达到平台上限时，以样本热度打破并列，避免所有城市视觉权重相同。
        const baseScore = item.countCapped || !countSpread
            ? heatScore
            : countScore * 0.82 + heatScore * 0.18;
        const intensity = 0.12 + Math.sqrt(Math.max(0, baseScore)) * 0.88;
        return {
            ...item,
            intensity,
            color: intensity >= 0.72 ? '#fb3f6c' : (intensity >= 0.42 ? '#facc15' : '#22d3ee')
        };
    });
}

async function loadGeoHotspots() {
    const key = getGeoFilterKey();
    if (state.geoSignalKey === key && state.geoSignals.length > 0) return;
    if (state.geoAbortController) state.geoAbortController.abort();
    const abortController = new AbortController();
    const sequence = ++state.geoSignalSequence;
    state.geoAbortController = abortController;
    el.globeView.classList.add('is-loading');

    const params = new URLSearchParams({
        platform: state.activePlatform,
        category: state.activeCategory || 'all',
        timeRange: state.activeTimeRange,
        query: state.searchQuery
    });
    try {
        const response = await fetch(`/api/geo-hotspots?${params}`, { signal: abortController.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || '城市热点索引加载失败');
        if (sequence !== state.geoSignalSequence || key !== getGeoFilterKey()) return;
        state.geoSignals = normalizeHotspotIntensity(data.list || []);
        state.geoSignalKey = key;
        updateGlobeFromVideos();
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Geo hotspots failed:', error);
            if (state.activeView === 'globe') showToast('城市索引暂不可用，已展示内容识别结果。');
        }
    } finally {
        if (sequence === state.geoSignalSequence) el.globeView.classList.remove('is-loading');
    }
}

function updateGlobeFromVideos() {
    const inferred = aggregateVideoHotspots(state.videoList);
    const useSignals = state.geoSignalKey === getGeoFilterKey() && state.geoSignals.length > 0;
    const hotspots = useSignals ? state.geoSignals : inferred.hotspots;
    const locatedVideos = useSignals
        ? hotspots.reduce((sum, item) => sum + Number(item.count || 0), 0)
        : inferred.locatedVideos;
    const hasCappedSignals = useSignals && hotspots.some(item => item.countCapped);
    const coverage = state.videoList.length ? locatedVideos / state.videoList.length : 0;
    el.geoCityCount.textContent = hotspots.length;
    el.geoVideoCount.textContent = `${formatCompactNumber(locatedVideos)}${hasCappedSignals ? '+' : ''}`;
    el.geoCoverage.textContent = useSignals ? '索引' : `${Math.round(coverage * 100)}%`;
    el.globeEmpty.classList.toggle('hidden', hotspots.length > 0);
    if (hotspots.length === 0) {
        el.globeEmpty.querySelector('h3').textContent = '当前结果暂无可定位城市';
        el.globeEmpty.querySelector('p').textContent = '尝试切换平台、扩大时效或搜索包含城市名称的热点。';
    }

    el.hotspotList.innerHTML = '';
    hotspots.forEach((hotspot, index) => {
        const row = document.createElement('button');
        row.className = 'hotspot-row';
        row.type = 'button';
        row.innerHTML = `
            <span class="hotspot-rank">${String(index + 1).padStart(2, '0')}</span>
            <span class="hotspot-city">
                <strong>${escapeHtml(hotspot.city)}</strong>
                <small>${escapeHtml(hotspot.country)} · ${formatCompactNumber(hotspot.totalHeat)} 热度</small>
            </span>
            <span class="hotspot-count">${hotspot.count}${hotspot.countCapped ? '+' : ''}<em>条</em></span>
        `;
        row.addEventListener('click', () => focusHotspot(hotspot));
        el.hotspotList.appendChild(row);
    });

    if (state.globe) {
        state.globe.pointsData(hotspots).ringsData(hotspots);
    }
}

function focusHotspot(hotspot) {
    if (!state.globe || !hotspot) return;
    state.globe.controls().autoRotate = false;
    state.globe.pointOfView({
        lat: hotspot.lat,
        lng: hotspot.lng,
        altitude: 1.35
    }, 900);
}

// ── Fetch Trends ──────────────────────────────
async function fetchTrends(forceRefresh = false) {
    const reqPlatform = state.activePlatform;
    const reqCategory = state.activeCategory;
    const reqSearchQuery = state.searchQuery;
    const reqTimeRange = state.activeTimeRange;
    const requestSequence = ++state.requestSequence;
    if (state.listAbortController) state.listAbortController.abort();
    const abortController = new AbortController();
    state.listAbortController = abortController;
    el.refreshBtn.disabled = true;
    el.refreshBtn.classList.add('is-loading');

    // Reset pagination states
    state.searchPage = 1;
    state.displayLimit = LAZY_PAGE_SIZE;
    state.hasMore = true;
    state.isMoreLoading = false;
    el.infiniteLoader.classList.add('hidden');
    el.endHint.classList.add('hidden');

    showLoader();
    try {
        const url = reqSearchQuery
            ? `/api/search?platform=${reqPlatform}&category=${reqCategory}&query=${encodeURIComponent(reqSearchQuery)}&timeRange=${reqTimeRange}&refresh=${forceRefresh ? 1 : 0}&_t=${Date.now()}`
            : `/api/trends?platform=${reqPlatform}&category=${reqCategory}&timeRange=${reqTimeRange}&refresh=${forceRefresh ? 1 : 0}&_t=${Date.now()}`;

        const res  = await fetch(url, { signal: abortController.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || '榜单请求失败');

        // Check for race conditions
        if (requestSequence !== state.requestSequence || reqPlatform !== state.activePlatform || reqCategory !== state.activeCategory || reqSearchQuery !== state.searchQuery || reqTimeRange !== state.activeTimeRange) {
            console.log(`Ignoring stale response for ${reqPlatform}/${reqCategory}/${reqSearchQuery}`);
            return;
        }

        if (data.success && data.list && data.list.length > 0) {
            state.videoList = data.list;
            state.geoSignals = [];
            state.geoSignalKey = '';
            updateGlobeFromVideos();
            if (state.activeView === 'globe') loadGeoHotspots();
            renderCards(data.list.slice(0, LAZY_PAGE_SIZE));
            hideLoader();

            if ((!reqSearchQuery && data.list.length <= LAZY_PAGE_SIZE) || data.hasMore === false) {
                state.hasMore = false;
                showEndHint(reqSearchQuery ? '已加载全部搜索结果' : '已加载全部数据（最多展示 100 条）');
            }
        } else {
            showEmptyState(data.message || '未能拉取到相关数据，请检查搜索词或网络配置并重试。');
        }
    } catch (err) {
        if (err.name === 'AbortError') return;
        if (requestSequence !== state.requestSequence || reqPlatform !== state.activePlatform || reqCategory !== state.activeCategory || reqSearchQuery !== state.searchQuery || reqTimeRange !== state.activeTimeRange) return;
        console.error('Fetch trends failed:', err);
        showEmptyState(err.message || '本地网络连接失败，请确认后端服务与代理配置。');
    } finally {
        if (requestSequence === state.requestSequence) {
            el.refreshBtn.disabled = false;
            el.refreshBtn.classList.remove('is-loading');
        }
    }
}

// ── Render Cards ──────────────────────────────
function renderCards(list) {
    el.cardsGrid.innerHTML = '';

    list.forEach((item, index) => {
        const card = document.createElement('article');
        card.className = 'video-card';

        // For Bilibili, proxy the cover image through our backend to bypass hotlink protection
        const coverSrc = item.platform === 'Bilibili' && item.cover
            ? `/api/proxy-image?url=${encodeURIComponent(item.cover)}`
            : (item.cover || '');

        const showRank = !state.searchQuery;
        const rankClass = index < 3 ? 'card-rank top3' : 'card-rank';
        const rankHTML = showRank ? `<span class="${rankClass}">${index + 1}</span>` : '';

        card.innerHTML = `
            <div class="card-thumbnail-wrapper">
                <img class="card-thumbnail" src="${escapeHtml(coverSrc)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.style.opacity='.3'">
                ${rankHTML}
                <span class="card-duration">${escapeHtml(item.duration)}</span>
                <div class="card-play-btn" data-idx="${index}">
                    <div class="card-play-btn-inner">
                        <i class="fa-solid fa-play" style="margin-left:3px"></i>
                    </div>
                </div>
            </div>
            <div class="card-details">
                <h3 class="card-title">${escapeHtml(item.title)}</h3>
                <div class="card-published">
                    <i class="fa-regular fa-clock"></i>
                    ${formatPublishedTime(item.pubdate)}
                </div>
                <div class="card-footer">
                    <div class="card-author">
                        <i class="fa-regular fa-circle-user"></i>
                        <span>${escapeHtml(item.author)}</span>
                    </div>
                    <div class="card-stats">
                        <i class="fa-regular fa-eye"></i>
                        ${escapeHtml(item.playCount)}
                    </div>
                </div>
            </div>
        `;

        // Click on play button → popup modal
        const playBtn = card.querySelector('.card-play-btn');
        playBtn.addEventListener('click', e => {
            e.stopPropagation();
            openPlayerModal(item);
        });

        // Click on card body → side drawer
        card.addEventListener('click', () => selectVideo(item));

        el.cardsGrid.appendChild(card);
    });
}

// ── Append Cards for Infinite Scroll ───────────
function appendCards(list) {
    list.forEach((item, index) => {
        const card = document.createElement('article');
        card.className = 'video-card';

        const coverSrc = item.platform === 'Bilibili' && item.cover
            ? `/api/proxy-image?url=${encodeURIComponent(item.cover)}`
            : (item.cover || '');

        // Search results do not show ranking numbers since they are not trends
        card.innerHTML = `
            <div class="card-thumbnail-wrapper">
                <img class="card-thumbnail" src="${escapeHtml(coverSrc)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.style.opacity='.3'">
                <span class="card-duration">${escapeHtml(item.duration)}</span>
                <div class="card-play-btn">
                    <div class="card-play-btn-inner">
                        <i class="fa-solid fa-play" style="margin-left:3px"></i>
                    </div>
                </div>
            </div>
            <div class="card-details">
                <h3 class="card-title">${escapeHtml(item.title)}</h3>
                <div class="card-published">
                    <i class="fa-regular fa-clock"></i>
                    ${formatPublishedTime(item.pubdate)}
                </div>
                <div class="card-footer">
                    <div class="card-author">
                        <i class="fa-regular fa-circle-user"></i>
                        <span>${escapeHtml(item.author)}</span>
                    </div>
                    <div class="card-stats">
                        <i class="fa-regular fa-eye"></i>
                        ${escapeHtml(item.playCount)}
                    </div>
                </div>
            </div>
        `;

        const playBtn = card.querySelector('.card-play-btn');
        playBtn.addEventListener('click', e => {
            e.stopPropagation();
            openPlayerModal(item);
        });

        card.addEventListener('click', () => selectVideo(item));
        el.cardsGrid.appendChild(card);
    });
}

function mergeAndSortVideos(current, incoming) {
    const unique = new Map();
    [...current, ...incoming].forEach(item => {
        const key = `${item.platform || ''}:${item.id || item.url || item.title}`;
        const previous = unique.get(key);
        if (!previous || Number(item.playRaw || 0) > Number(previous.playRaw || 0)) {
            unique.set(key, item);
        }
    });
    return [...unique.values()].sort((a, b) =>
        Number(b.playRaw || 0) - Number(a.playRaw || 0)
        || Number(b.pubdate || 0) - Number(a.pubdate || 0)
    );
}

// ── Load More Search Results (Lazy Load) ───────
async function loadMoreSearch() {
    state.isMoreLoading = true;
    el.infiniteLoader.classList.remove('hidden');

    const nextPage = state.searchPage + 1;
    const reqPlatform = state.activePlatform;
    const reqSearchQuery = state.searchQuery;
    const reqCategory = state.activeCategory;
    const reqTimeRange = state.activeTimeRange;
    const requestSequence = state.requestSequence;

    try {
        const url = `/api/search?platform=${reqPlatform}&category=${reqCategory}&query=${encodeURIComponent(reqSearchQuery)}&page=${nextPage}&timeRange=${reqTimeRange}&_t=${Date.now()}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || '加载更多失败');

        // Race-condition check
        if (requestSequence !== state.requestSequence || reqPlatform !== state.activePlatform || reqCategory !== state.activeCategory || reqSearchQuery !== state.searchQuery || reqTimeRange !== state.activeTimeRange) {
            return;
        }

        if (data.success && data.list && data.list.length > 0) {
            state.searchPage = nextPage;
            state.videoList = mergeAndSortVideos(state.videoList, data.list);
            renderCards(state.videoList);
        } else {
            state.hasMore = false;
            showEndHint('已加载全部搜索结果');
        }
    } catch (err) {
        console.error('Load more failed:', err);
    } finally {
        state.isMoreLoading = false;
        el.infiniteLoader.classList.add('hidden');
    }
}

// ── Load More Category/Trending Items Locally ───
function loadMoreTrendsLocal() {
    state.isMoreLoading = true;
    el.infiniteLoader.classList.remove('hidden');

    // Simulate 400ms delay for visual feedback
    setTimeout(() => {
        const currentLimit = state.displayLimit;
        const nextLimit = currentLimit + LAZY_PAGE_SIZE;
        const chunk = state.videoList.slice(currentLimit, nextLimit);

        if (chunk.length > 0) {
            appendCards(chunk);
            state.displayLimit = nextLimit;
        }

        state.isMoreLoading = false;
        el.infiniteLoader.classList.add('hidden');

        if (state.displayLimit >= state.videoList.length || chunk.length === 0) {
            state.hasMore = false;
            showEndHint('已加载全部数据（最多展示 100 条）');
        }
    }, 400);
}

// ── Show End Hint ─────────────────────────────
function showEndHint(text) {
    el.endHintText.textContent = text;
    el.endHint.classList.remove('hidden');
}

function formatPublishedTime(timestamp) {
    const seconds = Number(timestamp || 0);
    if (!seconds) return '实时榜单';

    const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000) - seconds);
    if (ageSeconds < 3600) return `${Math.max(1, Math.floor(ageSeconds / 60))} 分钟前`;
    if (ageSeconds < 86400) return `${Math.floor(ageSeconds / 3600)} 小时前`;
    if (ageSeconds < 7 * 86400) return `${Math.floor(ageSeconds / 86400)} 天前`;
    return new Date(seconds * 1000).toLocaleDateString('zh-CN');
}

// ── Popup Player Modal ────────────────────────
function openPlayerModal(video) {
    el.modalVideoWrapper.innerHTML = '';
    el.modalVideoTitle.textContent  = video.title;
    el.modalVideoAuthor.textContent = `作者：${video.author}`;

    if (video.platform === 'Bilibili') {
        const iframe = document.createElement('iframe');
        iframe.src = `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(video.id)}&as_wide=1&high_quality=1&danmaku=0`;
        iframe.allowFullscreen = true;
        iframe.setAttribute('sandbox', 'allow-same-origin allow-forms allow-scripts allow-presentation');
        el.modalVideoWrapper.appendChild(iframe);
    } else if (video.platform === 'YouTube') {
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(video.id)}?autoplay=1`;
        iframe.allowFullscreen = true;
        iframe.allow = 'autoplay; encrypted-media';
        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-presentation');
        el.modalVideoWrapper.appendChild(iframe);
    } else if (video.duration === 'Topic') {
        // Topics don't have a direct player — open side drawer instead
        selectVideo(video);
        return;
    } else {
        el.modalVideoWrapper.innerHTML = `
            <div class="player-placeholder" id="modal-parse-placeholder">
                <i class="fa-solid fa-circle-play"></i>
                <p style="margin-top:8px">短视频 CDN 需要嗅探直链<br>请点击下方抓取工具获取播放地址</p>
                <button id="modal-open-tools" class="modal-open-tools">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> 打开侧边工具箱
                </button>
            </div>
        `;
        document.getElementById('modal-open-tools').addEventListener('click', () => {
            closePlayerModal();
            selectVideo(video);
        });
    }

    el.playerModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closePlayerModal() {
    el.playerModal.classList.add('hidden');
    el.modalVideoWrapper.innerHTML = '';
    document.body.style.overflow = '';
}

// ── Side Drawer ───────────────────────────────
function selectVideo(video) {
    state.parseSequence += 1;
    state.selectedVideo = video;
    el.btnParseStream.disabled = false;
    el.btnParseStream.innerHTML = '<i class="fa-solid fa-circle-nodes"></i> 提取无水印/MP4直链';

    // Reset state
    el.streamUrlBox.classList.add('hidden');
    el.btnDownloadVideo.classList.add('hidden');
    el.streamUrlInput.value = '';

    // Fill metadata
    el.drawerPlatformBadge.textContent = video.platform;
    el.drawerVideoTitle.textContent    = video.title;
    el.drawerAuthorName.textContent    = video.author;
    el.drawerAuthorAvatar.src = (video.platform === 'Bilibili' && video.authorAvatar)
        ? `/api/proxy-image?url=${encodeURIComponent(video.authorAvatar)}`
        : (video.authorAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(video.author)}`);

    // AI placeholder
    el.aiCategoryBadge.textContent = '等待运行极速抓取';
    el.aiHighlightsList.innerHTML  = '<li>点击"提取无水印/MP4直链"后启动 AI 分析</li>';
    el.aiRecommendText.textContent = '提取视频直链后，AI 会根据文案内容生成学习与模仿建议。';

    // Show drawer
    el.detailDrawer.classList.remove('hidden');

    // Embed player
    embedPlayer(video);
}

function embedPlayer(video) {
    el.videoPlayerWrapper.innerHTML = '';

    if (video.platform === 'Bilibili') {
        const iframe = document.createElement('iframe');
        iframe.src = `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(video.id)}&as_wide=1&high_quality=1&danmaku=0`;
        iframe.allowFullscreen = true;
        iframe.setAttribute('sandbox', 'allow-same-origin allow-forms allow-scripts allow-presentation');
        el.videoPlayerWrapper.appendChild(iframe);

    } else if (video.platform === 'YouTube') {
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(video.id)}`;
        iframe.allowFullscreen = true;
        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-presentation');
        el.videoPlayerWrapper.appendChild(iframe);

    } else if (video.duration === 'Topic') {
        el.videoPlayerWrapper.innerHTML = `
            <div class="player-placeholder">
                <i class="fa-solid fa-fire-burner"></i>
                <p>正在拉取"${escapeHtml(video.word)}"话题的精彩解析视频...</p>
            </div>
        `;
        loadTopicVideos(video.word);

    } else {
        el.videoPlayerWrapper.innerHTML = `
            <div class="player-placeholder" style="cursor:pointer" id="parse-placeholder">
                <i class="fa-solid fa-circle-play"></i>
                <p>短视频 CDN，点击提取直链以在播放器中渲染播放</p>
            </div>
        `;
        document.getElementById('parse-placeholder').addEventListener('click', parseVideoLink);
    }
}

async function loadTopicVideos(word) {
    const requestSequence = state.parseSequence;
    const selectedVideo = state.selectedVideo;
    try {
        const res  = await fetch(`/api/search-topic?query=${encodeURIComponent(word)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || '相关视频加载失败');
        if (requestSequence !== state.parseSequence || selectedVideo !== state.selectedVideo) return;

        if (data.success && data.list && data.list.length > 0) {
            el.videoPlayerWrapper.innerHTML = `
                <div class="topic-sub-list-container">
                    <p class="topic-sub-title"><i class="fa-solid fa-network-wired"></i> 相关解析视频 (${data.list.length}条)</p>
                    <div class="topic-sub-list">
                        ${data.list.map((v, index) => `
                            <button class="topic-sub-card" type="button" data-topic-index="${index}">
                                <img src="/api/proxy-image?url=${encodeURIComponent(v.cover)}" alt="" onerror="this.style.opacity='.3'">
                                <div class="sub-info">
                                    <p class="sub-title">${escapeHtml(v.title)}</p>
                                    <p class="sub-meta">${escapeHtml(v.author)} · ${escapeHtml(v.playCount)}</p>
                                </div>
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
            el.videoPlayerWrapper.querySelectorAll('[data-topic-index]').forEach(button => {
                button.addEventListener('click', () => {
                    const video = data.list[Number(button.dataset.topicIndex)];
                    if (video) playSubVideo(video.id, video.title, video.author);
                });
            });
        } else {
            el.videoPlayerWrapper.innerHTML = `
                <div class="player-placeholder">
                    <i class="fa-regular fa-face-frown"></i>
                    <p>未找到该话题的相关解析视频</p>
                </div>
            `;
        }
    } catch (e) {
        if (requestSequence === state.parseSequence) console.error('loadTopicVideos failed:', e);
    }
}

function playSubVideo(bvid, title, author) {
    el.videoPlayerWrapper.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.src = `https://player.bilibili.com/player.html?bvid=${bvid}&as_wide=1&high_quality=1&danmaku=0`;
    iframe.allowFullscreen = true;
    iframe.setAttribute('sandbox', 'allow-same-origin allow-forms allow-scripts allow-presentation');
    el.videoPlayerWrapper.appendChild(iframe);
    el.drawerVideoTitle.textContent = title;
    el.drawerAuthorName.textContent = author;
    state.selectedVideo.url    = `https://www.bilibili.com/video/${bvid}`;
    state.selectedVideo.title  = title;
    state.selectedVideo.author = author;
}

// ── Parse stream link ─────────────────────────
async function parseVideoLink() {
    if (!state.selectedVideo) return;
    const selectedVideo = state.selectedVideo;
    const parseSequence = ++state.parseSequence;

    const orig = el.btnParseStream.innerHTML;
    el.btnParseStream.innerHTML  = '<i class="fa-solid fa-arrows-spin fa-spin"></i> 正在嗅探抓取流...';
    el.btnParseStream.disabled   = true;

    try {
        const res  = await fetch('/api/parse', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ url: selectedVideo.url })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || '视频直链解析失败');
        if (parseSequence !== state.parseSequence || state.selectedVideo !== selectedVideo) return;

        if (data.success && data.videoUrl) {
            el.streamUrlBox.classList.remove('hidden');
            el.streamUrlInput.value = data.videoUrl;

            el.btnDownloadVideo.classList.remove('hidden');
            const proxyVideoUrl = `/api/proxy-video?url=${encodeURIComponent(data.videoUrl)}&referer=${encodeURIComponent(selectedVideo.url)}`;
            el.btnDownloadVideo.onclick = () => {
                const link = document.createElement('a');
                link.href = `${proxyVideoUrl}&download=1`;
                link.download = 'hotpot-video.mp4';
                document.body.appendChild(link);
                link.click();
                link.remove();
            };

            // Replace drawer player with native video
            el.videoPlayerWrapper.innerHTML = '';
            const vid = document.createElement('video');
            vid.src     = proxyVideoUrl;
            vid.controls = true;
            vid.autoplay = true;
            vid.style.cssText = 'width:100%;height:100%;background:#000;';
            el.videoPlayerWrapper.appendChild(vid);

            runAIAnalysis(data.title || selectedVideo.title, data.description || '', parseSequence);
            showToast('🎉 视频直链提取成功，已载入播放器并启动 AI 拆解！');
        } else {
            showToast('嗅探失败：无法抓取视频数据，请尝试直接访问原网页。');
        }
    } catch (err) {
        console.error('Parse failed:', err);
        showToast('请求超时，请检查服务日志与代理状态。');
    } finally {
        if (parseSequence === state.parseSequence) {
            el.btnParseStream.innerHTML = orig;
            el.btnParseStream.disabled  = false;
        }
    }
}

// ── AI Analysis ───────────────────────────────
async function runAIAnalysis(title, desc, parseSequence = state.parseSequence) {
    try {
        const res  = await fetch('/api/analyze', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ title, description: desc })
        });
        const data = await res.json();
        if (!data.success || parseSequence !== state.parseSequence) return;

        el.aiCategoryBadge.textContent = data.category;
        el.aiHighlightsList.innerHTML  = '';
        data.highlights.forEach(h => {
            const li = document.createElement('li');
            li.textContent = h;
            el.aiHighlightsList.appendChild(li);
        });
        el.aiRecommendText.textContent = data.recommendations;
    } catch (e) { console.error('AI Analysis failed:', e); }
}

// ── UI State ─────────────────────────────────
function closeDrawer() {
    state.parseSequence += 1;
    el.detailDrawer.classList.add('hidden');
    el.videoPlayerWrapper.innerHTML = '';
    state.selectedVideo = null;
}

function showLoader() {
    el.loader.classList.remove('hidden');
    el.emptyState.classList.add('hidden');
    el.cardsGrid.classList.add('hidden');
    el.globeView.classList.toggle('is-loading', state.activeView === 'globe');
}

function hideLoader() {
    el.loader.classList.add('hidden');
    el.emptyState.classList.add('hidden');
    el.cardsGrid.classList.toggle('hidden', state.activeView !== 'feed');
    el.globeView.classList.remove('is-loading');
}

function showEmptyState(msg) {
    if (state.activeView === 'globe') {
        el.globeView.classList.remove('is-loading');
        el.globeEmpty.classList.remove('hidden');
        el.globeEmpty.querySelector('h3').textContent = '热点数据加载失败';
        el.globeEmpty.querySelector('p').textContent = msg || '请检查代理配置或刷新重试。';
        return;
    }
    el.loader.classList.add('hidden');
    el.emptyState.classList.remove('hidden');
    el.cardsGrid.classList.add('hidden');
    el.globeView.classList.remove('is-loading');
    const pEl = el.emptyState.querySelector('p');
    if (pEl) {
        pEl.textContent = msg || '未能拉取到热门数据，请检查代理配置或刷新重试。';
    }
}

// ── Toast Notifications ───────────────────────
function showToast(msg) {
    // Remove any existing toast
    document.querySelectorAll('.hp-toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = 'hp-toast';
    Object.assign(toast.style, {
        position:     'fixed',
        bottom:       '28px',
        left:         '50%',
        transform:    'translateX(-50%) translateY(8px)',
        background:   'rgba(16,16,20,0.97)',
        border:       '1px solid var(--accent)',
        color:        '#fff',
        padding:      '10px 22px',
        borderRadius: '10px',
        fontSize:     '13px',
        fontWeight:   '500',
        fontFamily:   'var(--font)',
        boxShadow:    '0 6px 30px rgba(0,0,0,0.6)',
        zIndex:       '9999',
        opacity:      '0',
        transition:   'all .28s ease',
        whiteSpace:   'nowrap',
        maxWidth:     '80vw',
        overflow:     'hidden',
        textOverflow: 'ellipsis'
    });
    toast.textContent = msg;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity   = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
        toast.style.opacity   = '0';
        toast.style.transform = 'translateX(-50%) translateY(8px)';
        setTimeout(() => toast.remove(), 300);
    }, 2800);
}

// ── Helpers ───────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatCompactNumber(value) {
    const number = Number(value || 0);
    if (number >= 100000000) return `${(number / 100000000).toFixed(1)}亿`;
    if (number >= 10000) return `${(number / 10000).toFixed(1)}万`;
    return number.toLocaleString('zh-CN');
}

async function copyText(text, successMessage) {
    try {
        await navigator.clipboard.writeText(text);
        showToast(successMessage);
    } catch {
        showToast('复制失败，请检查浏览器剪贴板权限。');
    }
}

// ── Authentication & Download System ─────────────────
async function checkAuthStatus() {
    if (!state.token) {
        updateUserUi(null);
        return;
    }
    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await res.json();
        if (res.ok && data.success) {
            state.currentUser = data.user;
            updateUserUi(data.user);
        } else {
            // Token expired
            state.token = '';
            state.currentUser = null;
            localStorage.removeItem('hotpot_token');
            updateUserUi(null);
        }
    } catch (e) {
        updateUserUi(null);
    }
}

function updateUserUi(user) {
    const loggedInBox = document.getElementById('user-logged-in-box');
    const loginTrigger = document.getElementById('user-login-trigger');
    const avatarEl = document.getElementById('user-avatar');
    const nickEl = document.getElementById('user-nickname');
    const badgeEl = document.getElementById('user-role-badge');
    const quotaEl = document.getElementById('user-quota-text');

    if (user) {
        if (loggedInBox) loggedInBox.classList.remove('hidden');
        if (loginTrigger) loginTrigger.classList.add('hidden');
        if (avatarEl) avatarEl.src = user.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=user';
        if (nickEl) nickEl.textContent = user.nickname || user.username;
        if (badgeEl) {
            badgeEl.textContent = user.role === 'admin' ? 'ADMIN' : (user.role === 'pro' ? 'PRO会员' : '免费用户');
            badgeEl.className = `role-badge ${user.role === 'admin' ? 'role-admin' : 'role-pro'}`;
        }
        if (quotaEl) {
            quotaEl.textContent = user.remaining >= 900 ? '今日下载配额: 无限制' : `今日下载配额: ${user.remaining}/5`;
        }
    } else {
        if (loggedInBox) loggedInBox.classList.add('hidden');
        if (loginTrigger) loginTrigger.classList.remove('hidden');
    }
}

function openAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.add('hidden');
}

function setupAuthEvents() {
    const openBtn = document.getElementById('open-login-btn');
    const closeBtn = document.getElementById('close-auth-modal-btn');
    const logoutBtn = document.getElementById('auth-logout-btn');
    const demoBtn = document.getElementById('btn-quick-demo');
    const tabs = document.querySelectorAll('.auth-tab');
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('register-form');
    const modal = document.getElementById('auth-modal');

    if (openBtn) openBtn.addEventListener('click', openAuthModal);
    if (closeBtn) closeBtn.addEventListener('click', closeAuthModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeAuthModal();
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            state.token = '';
            state.currentUser = null;
            localStorage.removeItem('hotpot_token');
            updateUserUi(null);
            showToast('已安全退出登录');
        });
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            if (target === 'login') {
                loginForm.classList.remove('hidden');
                regForm.classList.add('hidden');
            } else {
                loginForm.classList.add('hidden');
                regForm.classList.remove('hidden');
            }
        });
    });

    if (demoBtn) {
        demoBtn.addEventListener('click', async () => {
            try {
                const res = await fetch('/api/auth/demo-login', { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    state.token = data.token;
                    state.currentUser = data.user;
                    localStorage.setItem('hotpot_token', data.token);
                    updateUserUi(data.user);
                    closeAuthModal();
                    showToast('🎉 演示账号登入成功！享受 100% 科技功能');
                }
            } catch (e) {
                showToast('演示账号登入失败');
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value;
            const msgBox = document.getElementById('login-msg-box');

            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    state.token = data.token;
                    state.currentUser = data.user;
                    localStorage.setItem('hotpot_token', data.token);
                    updateUserUi(data.user);
                    closeAuthModal();
                    showToast(`欢迎回来，${data.user.nickname}！`);
                } else {
                    msgBox.textContent = data.message || '登录失败';
                    msgBox.className = 'auth-message-box error';
                    msgBox.classList.remove('hidden');
                }
            } catch (err) {
                msgBox.textContent = '服务器网络通讯异常';
                msgBox.className = 'auth-message-box error';
                msgBox.classList.remove('hidden');
            }
        });
    }

    if (regForm) {
        regForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('reg-username').value.trim();
            const nickname = document.getElementById('reg-nickname').value.trim();
            const password = document.getElementById('reg-password').value;
            const msgBox = document.getElementById('reg-msg-box');

            try {
                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, nickname })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    msgBox.textContent = '注册成功！正在为您登入...';
                    msgBox.className = 'auth-message-box success';
                    msgBox.classList.remove('hidden');
                    setTimeout(async () => {
                        const lRes = await fetch('/api/auth/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ username, password })
                        });
                        const lData = await lRes.json();
                        if (lData.success) {
                            state.token = lData.token;
                            state.currentUser = lData.user;
                            localStorage.setItem('hotpot_token', lData.token);
                            updateUserUi(lData.user);
                            closeAuthModal();
                            showToast(`注册并登录成功，欢迎使用 HotPot！`);
                        }
                    }, 800);
                } else {
                    msgBox.textContent = data.message || '注册失败';
                    msgBox.className = 'auth-message-box error';
                    msgBox.classList.remove('hidden');
                }
            } catch (err) {
                msgBox.textContent = '网络连接异常';
                msgBox.className = 'auth-message-box error';
                msgBox.classList.remove('hidden');
            }
        });
    }
}

// Download Action Helper
function downloadNoWatermarkVideo(videoUrl, title) {
    if (!state.token) {
        openAuthModal();
        showToast('请先登录即可享受无水印极速物理下载功能！');
        return;
    }

    showToast('🚀 已发起无水印极速下载，正在建立流传输...');
    const downloadApiUrl = `/api/download?videoUrl=${encodeURIComponent(videoUrl)}&title=${encodeURIComponent(title)}&token=${encodeURIComponent(state.token)}`;
    const anchor = document.createElement('a');
    anchor.href = downloadApiUrl;
    anchor.download = `${title || 'HotPot_Video'}.mp4`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
}

// Modal Player Action Buttons Setup
function setupPlayerDownloadActions() {
    const downloadBtn = document.getElementById('modal-download-btn');
    const sniffBtn = document.getElementById('modal-sniff-btn');

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            if (!state.selectedVideo) return;
            downloadNoWatermarkVideo(state.selectedVideo.url, state.selectedVideo.title);
        });
    }

    if (sniffBtn) {
        sniffBtn.addEventListener('click', async () => {
            if (!state.selectedVideo) return;
            if (!state.token) {
                openAuthModal();
                showToast('请先登录使用无水印嗅探功能');
                return;
            }
            showToast('⚡ 正在调用 MediaTools 嗅探引擎解析...');
            try {
                const res = await fetch('/api/parse', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${state.token}`
                    },
                    body: JSON.stringify({ url: state.selectedVideo.url })
                });
                const data = await res.json();
                if (data.success && data.videoUrl) {
                    showToast('🎉 无水印 MP4 嗅探成功！已开启物理直连下载');
                    downloadNoWatermarkVideo(data.videoUrl, state.selectedVideo.title);
                } else {
                    showToast(data.error || '嗅探解析失败');
                }
            } catch (e) {
                showToast('网络嗅探失败');
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    setupAuthEvents();
    setupPlayerDownloadActions();
});
