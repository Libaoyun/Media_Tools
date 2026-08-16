/**
 * HotPot — Global Multimedia Radar & Observatory
 * Core Application Controller (v2.6)
 */

document.addEventListener('DOMContentLoaded', () => {

    // ── Application State ───────────────────────────────────────────
    const state = {
        platform: 'bilibili',
        category: 'all',
        timeRange: 'all',
        searchQuery: '',
        metricMode: 'single', // 'single' (单视频热度) | 'topic' (全网话题事件热度)
        view: 'feed',         // 'feed' | 'globe'
        currentTopic: null,   // active topic in drilldown
        
        // Single Video Feed Data
        allVideos: [],
        displayedVideos: [],
        activeVideo: null,
        
        // Topic Feed Data
        topicsList: [],

        // Geo Radar Data
        geoHotspots: [],
        geoMetadata: null,

        // User Session
        user: null,

        // Infinite Scroll
        page: 1,
        pageSize: 16,
        isLoading: false,
        hasMore: true
    };

    // ── DOM References ──────────────────────────────────────────────
    const dom = {
        // Navigation & Platforms
        navBtns: document.querySelectorAll('.nav-btn'),
        platformTitle: document.getElementById('platform-title'),
        platformStatusBadge: document.getElementById('platform-status-badge'),
        sidebarProxyDot: document.getElementById('sidebar-proxy-dot'),

        // Search & Metric Toggle
        searchInput: document.getElementById('search-input'),
        searchBtn: document.getElementById('search-btn'),
        searchClearBtn: document.getElementById('search-clear-btn'),
        btnMetricSingle: document.getElementById('btn-metric-single'),
        btnMetricTopic: document.getElementById('btn-metric-topic'),

        // Views & Layout
        viewSwitchBtns: document.querySelectorAll('.view-switch-btn'),
        refreshBtn: document.getElementById('refresh-btn'),
        categoryFiltersContainer: document.getElementById('category-filters-container'),
        filterChips: document.querySelectorAll('.filter-chip'),
        timeChips: document.querySelectorAll('.time-chip'),
        gridScrollArea: document.getElementById('grid-scroll-area'),
        cardsGrid: document.getElementById('cards-grid'),
        topicsGrid: document.getElementById('topics-grid'),
        
        // Topic Drilldown View
        topicDrilldownView: document.getElementById('topic-drilldown-view'),
        btnBackToTopics: document.getElementById('btn-back-to-topics'),
        drilldownTopicTag: document.getElementById('drilldown-topic-tag'),
        drilldownTopicTitle: document.getElementById('drilldown-topic-title'),
        drilldownTopicMeta: document.getElementById('drilldown-topic-meta'),
        drilldownCardsGrid: document.getElementById('drilldown-cards-grid'),

        // Globe Radar
        globeView: document.getElementById('globe-view'),
        globeStage: document.getElementById('globe-stage'),
        globeEmpty: document.getElementById('globe-empty'),
        hotspotList: document.getElementById('hotspot-list'),
        geoCityCount: document.getElementById('geo-city-count'),
        geoVideoCount: document.getElementById('geo-video-count'),
        geoCoverage: document.getElementById('geo-coverage'),

        // States
        loader: document.getElementById('loader'),
        emptyState: document.getElementById('empty-state'),
        infiniteLoader: document.getElementById('infinite-loader'),
        endHint: document.getElementById('end-hint'),
        endHintText: document.getElementById('end-hint-text'),

        // Detail Drawer
        detailDrawer: document.getElementById('detail-drawer'),
        closeDrawerBtn: document.getElementById('close-drawer-btn'),
        drawerPlayerWrapper: document.getElementById('video-player-wrapper'),
        drawerDanmakuScreen: document.getElementById('drawer-danmaku-screen'),
        drawerDanmakuToggle: document.getElementById('drawer-danmaku-toggle'),
        drawerDanmakuInput: document.getElementById('drawer-danmaku-input'),
        drawerDanmakuSend: document.getElementById('drawer-danmaku-send'),
        drawerPlatformBadge: document.getElementById('drawer-platform-badge'),
        drawerOpenOriginBtn: document.getElementById('drawer-open-origin-btn'),
        drawerVideoTitle: document.getElementById('drawer-video-title'),
        drawerAuthorAvatar: document.getElementById('drawer-author-avatar'),
        drawerAuthorName: document.getElementById('drawer-author-name'),
        btnCopyLink: document.getElementById('btn-copy-link'),
        btnParseStream: document.getElementById('btn-parse-stream'),
        btnDownloadVideo: document.getElementById('btn-download-video'),
        streamUrlBox: document.getElementById('stream-url-box'),
        streamUrlInput: document.getElementById('stream-url-input'),
        btnCopyStream: document.getElementById('btn-copy-stream'),
        aiCategoryBadge: document.getElementById('ai-category-badge'),
        aiHighlightsList: document.getElementById('ai-highlights-list'),
        aiRecommendationText: document.getElementById('ai-recommendation-text'),

        // Popup Player Modal
        playerModal: document.getElementById('player-modal'),
        closePlayerModalBtn: document.getElementById('close-player-modal-btn'),
        modalPlatformBadge: document.getElementById('modal-platform-badge'),
        modalVideoTitle: document.getElementById('modal-video-title'),
        modalOpenOriginBtn: document.getElementById('modal-open-origin-btn'),
        modalVideoWrapper: document.getElementById('modal-video-wrapper'),
        modalDanmakuScreen: document.getElementById('modal-danmaku-screen'),
        modalDanmakuToggle: document.getElementById('modal-danmaku-toggle'),
        modalDanmakuInput: document.getElementById('modal-danmaku-input'),
        modalDanmakuSend: document.getElementById('modal-danmaku-send'),
        modalDanmakuCount: document.getElementById('modal-danmaku-count'),
        modalVideoAuthor: document.getElementById('modal-video-author'),
        modalVideoPlayCount: document.getElementById('modal-video-play-count'),
        modalCopyLinkBtn: document.getElementById('modal-copy-link-btn'),
        modalSniffBtn: document.getElementById('modal-sniff-btn'),
        modalDownloadBtn: document.getElementById('modal-download-btn'),

        // Settings Modal
        settingsBtn: document.getElementById('settings-btn'),
        settingsModal: document.getElementById('settings-modal'),
        closeModalBtn: document.getElementById('close-modal-btn'),
        settingProxy: document.getElementById('setting-proxy'),
        btnSaveSettings: document.getElementById('btn-save-settings'),
        proxyStatus: document.getElementById('proxy-status'),
        proxyPills: document.querySelectorAll('.proxy-pill-btn'),

        // Auth Modal & User UI
        userIdentityCard: document.getElementById('user-identity-card'),
        userLoggedInBox: document.getElementById('user-logged-in-box'),
        userLoginTrigger: document.getElementById('user-login-trigger'),
        openLoginBtn: document.getElementById('open-login-btn'),
        authLogoutBtn: document.getElementById('auth-logout-btn'),
        userAvatar: document.getElementById('user-avatar'),
        userNickname: document.getElementById('user-nickname'),
        userRoleBadge: document.getElementById('user-role-badge'),

        authModal: document.getElementById('auth-modal'),
        closeAuthModalBtn: document.getElementById('close-auth-modal-btn'),
        btnRoleAdmin: document.getElementById('btn-role-admin'),
        btnRolePro: document.getElementById('btn-role-pro'),
        btnRoleDemo: document.getElementById('btn-role-demo'),
        authTabs: document.querySelectorAll('.auth-tab'),
        loginForm: document.getElementById('login-form'),
        registerForm: document.getElementById('register-form'),
        loginUsername: document.getElementById('login-username'),
        loginPassword: document.getElementById('login-password'),
        loginMsgBox: document.getElementById('login-msg-box'),
        regUsername: document.getElementById('reg-username'),
        regNickname: document.getElementById('reg-nickname'),
        regPassword: document.getElementById('reg-password'),
        regMsgBox: document.getElementById('reg-msg-box'),

        // Toast Container
        toastContainer: document.getElementById('toast-container')
    };

    const PLATFORM_CONFIG = {
        bilibili:    { name: '哔哩哔哩', color: '#fb7299', glow: 'rgba(251,114,153,0.3)', badge: 'B站全站热门' },
        douyin:      { name: '抖音热点', color: '#22d3ee', glow: 'rgba(34,211,238,0.3)', badge: '短视频风向标' },
        youtube:     { name: 'YouTube', color: '#ff0033', glow: 'rgba(255,0,51,0.3)', badge: '全球顶流视频' },
        tiktok:      { name: 'TikTok', color: '#00f2fe', glow: 'rgba(0,242,254,0.3)', badge: '海外现象级趋势' },
        twitter:     { name: 'Twitter / X', color: '#38bdf8', glow: 'rgba(56,189,248,0.3)', badge: '全球即时话题' },
        xiaohongshu: { name: '小红书', color: '#ff2442', glow: 'rgba(255,36,66,0.3)', badge: '爆款生活笔记' },
        kuaishou:    { name: '快手热门', color: '#ff5000', glow: 'rgba(255,80,0,0.3)', badge: '国民热度精选' }
    };

    // ── High Performance Danmaku Engine ─────────────────────────────
    class DanmakuEngine {
        constructor() {
            this.active = true;
            this.timers = [];
            this.sampleDanmakus = [
                '太强了这个名场面！', '全体起立！！！', '前方核能预警 ⚡', '这播放量真的封神了',
                '哈哈哈哈哈笑到满地找头', '这就是艺术！', '好绝的运镜和剪辑', '亿遍打卡！',
                '原汁原味太爽了', '2025还在看', '神级卡点直接起飞', '膝盖收下吧！'
            ];
        }

        start(containerEl) {
            this.stop();
            if (!containerEl) return;
            containerEl.innerHTML = '';
            
            // Emit continuous organic danmakus
            const intervalId = setInterval(() => {
                if (!this.active || document.hidden) return;
                const text = this.sampleDanmakus[Math.floor(Math.random() * this.sampleDanmakus.length)];
                this.emit(containerEl, text, false);
            }, 1800);
            this.timers.push(intervalId);
        }

        emit(containerEl, text, isUser = false) {
            if (!containerEl) return;
            const el = document.createElement('div');
            el.className = `danmaku-item ${isUser ? 'is-user' : ''}`;
            el.textContent = text;
            
            const topPercent = Math.floor(Math.random() * 65) + 10;
            el.style.top = `${topPercent}%`;
            
            const duration = Math.floor(Math.random() * 3) + (isUser ? 6 : 7);
            el.style.animationDuration = `${duration}s`;
            
            if (!isUser) {
                const styles = ['hot', 'cool', 'glow', ''];
                const chosen = styles[Math.floor(Math.random() * styles.length)];
                if (chosen) el.classList.add(chosen);
            }

            containerEl.appendChild(el);
            setTimeout(() => {
                if (el.parentNode === containerEl) {
                    containerEl.removeChild(el);
                }
            }, duration * 1000 + 500);
        }

        toggle(containerEl, btnEl) {
            this.active = !this.active;
            if (btnEl) {
                btnEl.classList.toggle('active', this.active);
                btnEl.innerHTML = `<i class="fa-solid fa-comment-dots"></i> <span>弹幕 ${this.active ? '开' : '关'}</span>`;
            }
            if (containerEl) {
                containerEl.style.display = this.active ? 'block' : 'none';
            }
        }

        stop() {
            this.timers.forEach(t => clearInterval(t));
            this.timers = [];
        }
    }

    const danmakuEngine = new DanmakuEngine();

    // ── 3D Globe Radar Controller (Optimized WebGL, Static View, 4-Tier Colors) ─
    class GlobeRadarController {
        constructor() {
            this.globe = null;
            this.isInitialized = false;
            this.resizeHandler = null;
        }

        init(containerEl) {
            if (!window.Globe || !containerEl || this.isInitialized) return;

            try {
                this.globe = Globe()(containerEl)
                    .globeImageUrl('/vendor/earth-blue-marble.jpg')
                    .bumpImageUrl('/vendor/earth-topology.png')
                    .backgroundImageUrl('/vendor/night-sky.png')
                    .backgroundColor('rgba(3, 5, 9, 0)')
                    .showAtmosphere(true)
                    .atmosphereColor('#38bdf8')
                    .atmosphereAltitude(0.20)
                    .pointLat('lat')
                    .pointLng('lng')
                    .pointColor(d => d.color || (d.tier === 'high' ? '#ff2442' : (d.tier === 'medium' ? '#f59e0b' : (d.tier === 'normal' ? '#10b981' : '#06b6d4'))))
                    .pointAltitude(d => d.tier === 'high' ? 0.35 : (d.tier === 'medium' ? 0.22 : (d.tier === 'normal' ? 0.12 : 0.06)))
                    .pointRadius(d => d.tier === 'high' ? 1.6 : (d.tier === 'medium' ? 1.2 : (d.tier === 'normal' ? 0.9 : 0.6)))
                    .pointResolution(12)
                    .pointLabel(d => `
                        <div style="background: rgba(14,18,28,0.96); border: 1px solid ${d.color || '#38bdf8'}; border-radius: 8px; padding: 8px 12px; color: #fff; font-family: Outfit, sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,0.6);">
                            <div style="font-weight: 700; font-size: 13px; color: ${d.color || '#38bdf8'};">${d.city} · ${d.country}</div>
                            <div style="font-size: 11px; color: #94a3b8; margin-top: 3px;">关联作品: ${d.countDisplay || d.count + '篇'}</div>
                            <div style="font-size: 10.5px; color: #4ade80;">综合传播: ${d.totalHeatDisplay || d.totalHeat + '热度'}</div>
                        </div>
                    `)
                    .onPointClick((point) => {
                        this.focusCity(point.lat, point.lng);
                    });

                // Set camera altitude (Center on China / East Asia initially)
                this.globe.pointOfView({ lat: 31.2, lng: 115.5, altitude: 2.1 }, 1000);
                
                // Disable auto rotation per user directive
                const controls = this.globe.controls();
                if (controls) {
                    controls.autoRotate = false;
                    controls.enableDamping = true;
                    controls.dampingFactor = 0.08;
                }

                // Debounced Resize Observer
                this.resizeHandler = () => {
                    if (this.globe && containerEl.clientWidth > 0 && containerEl.clientHeight > 0) {
                        this.globe.width(containerEl.clientWidth);
                        this.globe.height(containerEl.clientHeight);
                    }
                };
                window.addEventListener('resize', this.resizeHandler);

                this.isInitialized = true;
            } catch (err) {
                console.error('[Globe] Initialization failed:', err);
            }
        }

        updatePoints(hotspots) {
            if (!this.globe) return;
            this.globe.pointsData(hotspots || []);
        }

        focusCity(lat, lng) {
            if (!this.globe) return;
            this.globe.pointOfView({ lat, lng, altitude: 1.2 }, 1000);
        }

        destroy() {
            if (this.resizeHandler) {
                window.removeEventListener('resize', this.resizeHandler);
            }
            this.isInitialized = false;
        }
    }

    const globeRadar = new GlobeRadarController();

    // ── Network & API Layer ─────────────────────────────────────────
    async function fetchVideosApi(platform, category, timeRange, query = '') {
        const queryParams = new URLSearchParams({
            platform: platform || state.platform,
            category: category || state.category,
            timeRange: timeRange || state.timeRange
        });
        if (query) queryParams.set('query', query);

        const endpoint = query ? `/api/search?${queryParams.toString()}` : `/api/trends?${queryParams.toString()}`;
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    }

    async function fetchTopicsApi(platform, category, timeRange) {
        const queryParams = new URLSearchParams({
            platform: platform || state.platform,
            category: category || state.category,
            timeRange: timeRange || state.timeRange
        });
        const res = await fetch(`/api/topics?${queryParams.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    }

    async function fetchTopicVideosApi(topic) {
        const queryParams = new URLSearchParams({
            query: topic.title,
            topicId: topic.id || '',
            platform: state.platform
        });
        const res = await fetch(`/api/search-topic?${queryParams.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    }

    async function fetchGeoRadarApi() {
        const queryParams = new URLSearchParams({
            platform: state.platform,
            category: state.category,
            timeRange: state.timeRange
        });
        const res = await fetch(`/api/geo-hotspots?${queryParams.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    }

    // ── Main Data Orchestrator ──────────────────────────────────────
    async function loadData(reset = true) {
        if (state.isLoading) return;
        state.isLoading = true;

        if (reset) {
            state.page = 1;
            state.hasMore = true;
            state.allVideos = [];
            state.displayedVideos = [];
            state.topicsList = [];
            state.currentTopic = null;

            // UI Reset
            dom.loader.classList.remove('hidden');
            dom.emptyState.classList.add('hidden');
            dom.cardsGrid.classList.add('hidden');
            dom.topicsGrid.classList.add('hidden');
            dom.topicDrilldownView.classList.add('hidden');
            dom.endHint.classList.add('hidden');
            dom.refreshBtn.classList.add('is-loading');
        }

        try {
            if (state.metricMode === 'topic') {
                // Topic Mode
                await loadTopicLeaderboard();
            } else {
                // Single Video Mode
                await loadSingleVideoList();
            }

            // Sync Geo Radar in Background
            loadGeoHotspots();
        } catch (err) {
            console.error('[App] Load data failed:', err);
            showToast(`加载失败: ${err.message}`, 'error');
            dom.emptyState.classList.remove('hidden');
        } finally {
            state.isLoading = false;
            dom.loader.classList.add('hidden');
            dom.refreshBtn.classList.remove('is-loading');
        }
    }

    // ── Metric Mode 1: Single Video Feed ────────────────────────────
    async function loadSingleVideoList() {
        const result = await fetchVideosApi(state.platform, state.category, state.timeRange, state.searchQuery);
        const list = result.list || [];

        if (list.length === 0) {
            dom.emptyState.classList.remove('hidden');
            dom.cardsGrid.classList.add('hidden');
            return;
        }

        state.allVideos = list;
        state.displayedVideos = list.slice(0, state.pageSize);
        
        renderVideoCards(state.displayedVideos, dom.cardsGrid);
        dom.cardsGrid.classList.remove('hidden');

        if (state.displayedVideos.length >= state.allVideos.length) {
            dom.endHint.classList.remove('hidden');
        }
    }

    const CATEGORY_SAMPLE_COVERS = {
        comedy: [
            'https://images.unsplash.com/photo-1527224857830-43a7acc85260?q=80&w=700',
            'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=700'
        ],
        ent: [
            'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=700',
            'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=700'
        ],
        fashion: [
            'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=700',
            'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=700'
        ],
        pets: [
            'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=700',
            'https://images.unsplash.com/photo-1543466835-00a7907e9de1?q=80&w=700'
        ],
        wildlife: [
            'https://images.unsplash.com/photo-1546182990-dffeafbe841d?q=80&w=700',
            'https://images.unsplash.com/photo-1544551763-46a013bb70d5?q=80&w=700'
        ],
        tech: [
            'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=700',
            'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=700'
        ],
        marketing: [
            'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=700',
            'https://images.unsplash.com/photo-1551836022-d5d88e9218df?q=80&w=700'
        ],
        kuso: [
            'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=700',
            'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=700'
        ]
    };

    function getSafeCoverUrl(video, index = 0) {
        if (video.cover && typeof video.cover === 'string' && video.cover.startsWith('http')) {
            return video.cover;
        }
        const cat = (state.category && state.category !== 'all') ? state.category : 'comedy';
        const list = CATEGORY_SAMPLE_COVERS[cat] || CATEGORY_SAMPLE_COVERS.comedy;
        return list[index % list.length];
    }

    function renderVideoCards(videos, containerEl) {
        containerEl.innerHTML = '';
        const fragment = document.createDocumentFragment();

        videos.forEach((video, index) => {
            const card = document.createElement('div');
            card.className = 'video-card';
            
            const rank = index + 1;
            const rankClass = rank === 1 ? 'top-1' : (rank === 2 ? 'top-2' : (rank === 3 ? 'top-3' : ''));
            const rankIcon = rank === 1 ? '👑 #1' : (rank === 2 ? '🥈 #2' : (rank === 3 ? '🥉 #3' : `#${rank}`));
            
            const displayViews = video.playCount || formatHeat(video.playRaw || 0);
            const coverUrl = getSafeCoverUrl(video, index);

            card.innerHTML = `
                <div class="card-thumbnail-wrapper">
                    <img class="card-thumbnail" src="${escapeHtml(coverUrl)}" alt="${escapeHtml(video.title)}" loading="lazy">
                    <span class="card-rank ${rankClass}">${rankIcon}</span>
                    <span class="card-duration">${escapeHtml(video.duration || 'Shorts')}</span>
                    <div class="card-play-btn">
                        <div class="card-play-btn-inner"><i class="fa-solid fa-play"></i></div>
                    </div>
                </div>
                <div class="card-details">
                    <h3 class="card-title" title="${escapeHtml(video.title)}">${escapeHtml(video.title)}</h3>
                    <div class="card-published">
                        <i class="fa-regular fa-clock"></i>
                        <span>${formatPublishDate(video.pubdate)}</span>
                    </div>
                    <div class="card-footer">
                        <span class="card-author" title="${escapeHtml(video.author || '达人')}">
                            <i class="fa-solid fa-circle-user"></i> ${escapeHtml(video.author || '达人')}
                        </span>
                        <div class="card-stats" title="单视频真实播放量">
                            <i class="fa-solid fa-fire"></i>
                            <span>${displayViews} 播放</span>
                        </div>
                    </div>
                </div>
            `;

            card.addEventListener('click', () => {
                openVideoModal(video);
            });

            fragment.appendChild(card);
        });

        containerEl.appendChild(fragment);
    }

    // ── Metric Mode 2: Topic Event Leaderboard ──────────────────────
    async function loadTopicLeaderboard() {
        const result = await fetchTopicsApi(state.platform, state.category, state.timeRange);
        const list = result.list || [];

        if (list.length === 0) {
            dom.emptyState.classList.remove('hidden');
            dom.topicsGrid.classList.add('hidden');
            return;
        }

        state.topicsList = list;
        renderTopicLeaderboard(state.topicsList, dom.topicsGrid);
        dom.topicsGrid.classList.remove('hidden');
        dom.endHint.classList.remove('hidden');
    }

    function renderTopicLeaderboard(topics, containerEl) {
        containerEl.innerHTML = '';
        const fragment = document.createDocumentFragment();

        topics.forEach((topic, index) => {
            const card = document.createElement('div');
            card.className = 'topic-event-card';

            const rank = index + 1;
            const rankClass = rank === 1 ? 'top-1' : (rank === 2 ? 'top-2' : (rank === 3 ? 'top-3' : ''));
            const rankIcon = rank === 1 ? '👑 1' : (rank === 2 ? '🥈 2' : (rank === 3 ? '🥉 3' : `${rank}`));

            card.innerHTML = `
                <div class="topic-card-left">
                    <div class="topic-rank-badge ${rankClass}">${rankIcon}</div>
                    <div class="topic-content-box">
                        <div class="topic-title-row">
                            <span class="topic-tag-pill">${escapeHtml(topic.tag || '🔥 爆款')}</span>
                            <h3 class="topic-title-text">${escapeHtml(topic.title)}</h3>
                        </div>
                        <p class="topic-desc-text">${escapeHtml(topic.desc || '全网综合热门话题与挑战赛讨论狂潮')}</p>
                    </div>
                </div>
                <div class="topic-card-right">
                    <div class="topic-stats-column">
                        <span class="topic-heat-badge"><i class="fa-solid fa-fire"></i> ${escapeHtml(topic.heatDisplay || '10亿+')} 热度</span>
                        <span class="topic-works-count">${escapeHtml(topic.worksCountDisplay || '2.4万篇作品')}</span>
                    </div>
                    <button class="btn-view-topic-videos">
                        <span>查看关联视频</span> <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>
            `;

            card.addEventListener('click', () => {
                openTopicDrilldown(topic);
            });

            fragment.appendChild(card);
        });

        containerEl.appendChild(fragment);
    }

    // ── Metric Mode 2: Topic Drill-Down ─────────────────────────────
    async function openTopicDrilldown(topic) {
        state.currentTopic = topic;
        
        // Switch View
        dom.topicsGrid.classList.add('hidden');
        dom.topicDrilldownView.classList.remove('hidden');
        dom.drilldownCardsGrid.innerHTML = `
            <div class="loader-container" style="grid-column: 1 / -1;">
                <div class="neon-spinner"></div>
                <p>正在拉取话题【${escapeHtml(topic.title)}】下的高播放量爆款视频...</p>
            </div>
        `;

        dom.drilldownTopicTag.textContent = topic.tag || '🔥 爆款话题';
        dom.drilldownTopicTitle.textContent = topic.title;
        dom.drilldownTopicMeta.textContent = `全网话题总热度: ${topic.heatDisplay || '20亿+'} · 关联作品从高到低排序`;

        try {
            const res = await fetchTopicVideosApi(topic);
            const videos = res.list || [];

            if (videos.length === 0) {
                dom.drilldownCardsGrid.innerHTML = `
                    <div class="empty-container" style="grid-column: 1 / -1;">
                        <i class="fa-regular fa-folder-open empty-icon"></i>
                        <h3>暂无该话题下的视频</h3>
                    </div>
                `;
                return;
            }

            renderVideoCards(videos, dom.drilldownCardsGrid);
        } catch (err) {
            console.error('[Drilldown] Fetch failed:', err);
            showToast('获取话题关联视频失败', 'error');
        }
    }

    function closeTopicDrilldown() {
        state.currentTopic = null;
        dom.topicDrilldownView.classList.add('hidden');
        dom.topicsGrid.classList.remove('hidden');
    }

    // ── Infinite Scroll Pagination ──────────────────────────────────
    function handleScrollPagination() {
        if (state.metricMode !== 'single' || state.isLoading || !state.hasMore) return;

        const { scrollTop, scrollHeight, clientHeight } = dom.gridScrollArea;
        if (scrollTop + clientHeight >= scrollHeight - 120) {
            loadNextPage();
        }
    }

    function loadNextPage() {
        if (state.isLoading) return;
        const currentLength = state.displayedVideos.length;
        const totalLength = state.allVideos.length;

        if (currentLength >= totalLength) {
            state.hasMore = false;
            dom.infiniteLoader.classList.add('hidden');
            dom.endHint.classList.remove('hidden');
            return;
        }

        dom.infiniteLoader.classList.remove('hidden');
        state.isLoading = true;

        setTimeout(() => {
            state.page += 1;
            const nextBatch = state.allVideos.slice(currentLength, currentLength + state.pageSize);
            state.displayedVideos = [...state.displayedVideos, ...nextBatch];
            renderVideoCards(state.displayedVideos, dom.cardsGrid);
            
            dom.infiniteLoader.classList.add('hidden');
            state.isLoading = false;

            if (state.displayedVideos.length >= totalLength) {
                state.hasMore = false;
                dom.endHint.classList.remove('hidden');
            }
        }, 300);
    }

    // ── 3D Geo Radar Data Synchronizer (All 48 Cities & Multi-Tier Metrics) ─
    async function loadGeoHotspots() {
        try {
            const data = await fetchGeoRadarApi();
            const hotspots = Array.isArray(data.list) ? data.list : (Array.isArray(data.hotspots) ? data.hotspots : []);
            
            state.geoHotspots = hotspots;
            
            // Update Metrics
            dom.geoCityCount.textContent = hotspots.length || 48;
            
            const totalEstimatedWorks = data.totalSignals || hotspots.reduce((acc, cur) => acc + (cur.count || 0), 0);
            dom.geoVideoCount.textContent = formatHeat(totalEstimatedWorks) + '篇';

            // Render Panel List (Show all 48 cities with custom tier indicators)
            renderHotspotList(hotspots);

            // Update Globe 3D Points
            if (globeRadar.isInitialized) {
                globeRadar.updatePoints(hotspots);
            }
        } catch (err) {
            console.error('[Geo] Load failed:', err);
        }
    }

    function renderHotspotList(hotspots) {
        dom.hotspotList.innerHTML = '';
        hotspots.forEach(spot => {
            const row = document.createElement('div');
            row.className = 'hotspot-row';
            const tierClass = spot.tier || 'normal';
            row.innerHTML = `
                <span><i class="legend-dot ${tierClass}"></i> <strong>${escapeHtml(spot.city)}</strong> · ${escapeHtml(spot.country)}</span>
                <span style="color: ${spot.color || '#38bdf8'}; font-weight: 700;">${escapeHtml(spot.countDisplay || formatHeat(spot.count) + '篇')}</span>
            `;
            row.addEventListener('click', () => {
                globeRadar.focusCity(spot.lat, spot.lng);
            });
            dom.hotspotList.appendChild(row);
        });
    }

    // ── Popup Video Player & Origin Platform Link ───────────────────
    function openVideoModal(video) {
        state.activeVideo = video;

        dom.modalPlatformBadge.textContent = video.platform || state.platform.toUpperCase();
        dom.modalVideoTitle.textContent = video.title || '视频播放';
        dom.modalVideoAuthor.innerHTML = `<i class="fa-regular fa-user"></i> ${escapeHtml(video.author || '达人')}`;
        dom.modalVideoPlayCount.innerHTML = `<i class="fa-regular fa-eye"></i> ${escapeHtml(video.playCount || formatHeat(video.playRaw || 0))} 播放`;

        // Direct Original Platform Link in New Tab
        const originUrl = video.url || `https://www.bilibili.com/video/${video.id}`;
        dom.modalOpenOriginBtn.href = originUrl;

        // Player Embed Construction
        renderPlayerEmbed(video, dom.modalVideoWrapper);

        // Start Danmaku Engine
        danmakuEngine.start(dom.modalDanmakuScreen);

        // Open Modal
        dom.playerModal.classList.remove('hidden');
    }

    function renderPlayerEmbed(video, containerEl) {
        containerEl.innerHTML = '';
        const bvid = video.id;

        if (bvid && (bvid.startsWith('BV') || bvid.startsWith('av'))) {
            // Bilibili Iframe Player
            const iframe = document.createElement('iframe');
            iframe.src = `https://player.bilibili.com/player.html?bvid=${bvid}&page=1&high_quality=1&as_wide=1&allowfullscreen=true&autoplay=1`;
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
            containerEl.appendChild(iframe);
        } else if (video.streamUrl) {
            // Direct MP4 / HLS Video Element
            const videoEl = document.createElement('video');
            videoEl.src = video.streamUrl;
            videoEl.controls = true;
            videoEl.autoplay = true;
            containerEl.appendChild(videoEl);
        } else {
            // High-Tech Cyber Placeholder with Instant Sniffer
            containerEl.innerHTML = `
                <div class="player-placeholder" style="background: #000;">
                    <img src="${escapeHtml(video.cover || '')}" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.4; filter: blur(4px);">
                    <div style="position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 10px;">
                        <i class="fa-solid fa-circle-play" style="font-size: 48px; color: #38bdf8; cursor: pointer;"></i>
                        <p style="color: #fff; font-size: 14px; font-weight: 600;">点击右上角「在原平台打开」直接播放原高清画质</p>
                    </div>
                </div>
            `;
        }
    }

    function closePlayerModal() {
        dom.playerModal.classList.add('hidden');
        dom.modalVideoWrapper.innerHTML = '';
        danmakuEngine.stop();
    }

    // ── Stream Sniffer & Video Action Tools ──────────────────────────
    async function sniffVideoDirectStream(video, btnEl) {
        if (!video) return;
        const targetUrl = video.url || `https://www.bilibili.com/video/${video.id}`;
        
        const originalBtnHtml = btnEl ? btnEl.innerHTML : '';
        if (btnEl) {
            btnEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 嗅探中...`;
            btnEl.disabled = true;
        }

        showToast('正在启动引擎，智能提取物理视频流...', 'info');

        try {
            const res = await fetch('/api/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: targetUrl })
            });
            const data = await res.json();

            if (data.success && data.videoUrl) {
                video.streamUrl = data.videoUrl;
                renderPlayerEmbed(video, dom.modalVideoWrapper);
                showToast('嗅探成功！已切换至原画直链播放', 'success');

                // Drawer Tools Feedback
                dom.streamUrlInput.value = data.videoUrl;
                dom.streamUrlBox.classList.remove('hidden');
                dom.btnDownloadVideo.classList.remove('hidden');
                
                // Populate AI Insights
                populateAiInsights(video);
            } else {
                showToast('已获取原站播放凭证，建议在原平台直接观看', 'info');
            }
        } catch (err) {
            console.error('[Sniff] Error:', err);
            showToast('嗅探服务繁忙，已为您准备原平台直达链接', 'info');
        } finally {
            if (btnEl) {
                btnEl.innerHTML = originalBtnHtml;
                btnEl.disabled = false;
            }
        }
    }

    function downloadVideo(video) {
        if (!video) return;
        const targetUrl = video.streamUrl || video.url || `https://www.bilibili.com/video/${video.id}`;
        
        if (video.streamUrl) {
            // Direct download link via proxy
            const proxyDownloadUrl = `/api/proxy-video?url=${encodeURIComponent(video.streamUrl)}&download=1`;
            window.open(proxyDownloadUrl, '_blank');
            showToast('已开始极速下载高清视频文件', 'success');
        } else {
            showToast('正在为您跳转原平台高清下载页...', 'info');
            window.open(targetUrl, '_blank');
        }
    }

    function copyVideoLink(video) {
        if (!video) return;
        const link = video.url || `https://www.bilibili.com/video/${video.id}`;
        navigator.clipboard.writeText(link).then(() => {
            showToast('已成功复制视频原链接到剪贴板！', 'success');
        }).catch(() => {
            showToast('复制链接失败，请手动复制', 'error');
        });
    }

    function populateAiInsights(video) {
        dom.aiCategoryBadge.textContent = `${video.platform || '全网'} · 爆款指数 98.6`;
        dom.aiHighlightsList.innerHTML = `
            <li><strong>黄金前3秒：</strong>采用强冲突视觉定格，迅速拉高用户停留率</li>
            <li><strong>中段节奏：</strong>卡点音效配合转场，密集输出情绪价值</li>
            <li><strong>收尾互动：</strong>提出话题性问题，引导弹幕与评论区争论二创</li>
        `;
        dom.aiRecommendationText.textContent = `该视频在 ${video.platform} 极具传播力，建议提炼前5秒黄金文案，配合热门BGM进行同领域选题模仿。`;
    }

    // ── Authentication & Role Switching ─────────────────────────────
    async function initUserSession() {
        try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                if (data.user) {
                    setUserSession(data.user);
                    return;
                }
            }
        } catch (e) {}

        // Default Demo User
        setUserSession({
            username: 'demo',
            nickname: '体验用户',
            role: 'user',
            avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=demo'
        });
    }

    function setUserSession(user) {
        state.user = user;
        updateUserUi(user);
    }

    function updateUserUi(user) {
        if (!user) {
            dom.userLoggedInBox.classList.add('hidden');
            dom.userLoginTrigger.classList.remove('hidden');
            return;
        }

        dom.userLoggedInBox.classList.remove('hidden');
        dom.userLoginTrigger.classList.add('hidden');

        dom.userAvatar.src = user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`;
        dom.userNickname.textContent = user.nickname || user.username;

        const role = user.role || 'user';
        dom.userRoleBadge.className = `role-badge role-${role}`;
        dom.userRoleBadge.textContent = role === 'admin' ? 'ADMIN' : (role === 'pro' ? 'PRO' : 'USER');
    }

    async function switchRole(roleType) {
        try {
            const res = await fetch('/api/auth/demo-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: roleType })
            });
            const data = await res.json();
            if (data.success && data.user) {
                setUserSession(data.user);
                showToast(`已切换身份为: ${data.user.nickname}`, 'success');
                dom.authModal.classList.add('hidden');
            }
        } catch (err) {
            showToast('切换角色失败', 'error');
        }
    }

    // ── Settings & Proxy ────────────────────────────────────────────
    async function loadSettings() {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            if (data.success) {
                dom.settingProxy.value = data.proxy || '';
                updateProxyStatus(data.proxy);
            }
        } catch (e) {}
    }

    function updateProxyStatus(proxyUrl) {
        const hasProxy = Boolean(proxyUrl && proxyUrl.trim());
        dom.proxyStatus.className = `proxy-status-badge ${hasProxy ? 'active' : 'inactive'}`;
        dom.proxyStatus.textContent = hasProxy ? '已连接' : '未连接';
        dom.sidebarProxyDot.classList.toggle('active', hasProxy);
    }

    async function saveSettings() {
        const proxy = dom.settingProxy.value.trim();
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ proxy })
            });
            const data = await res.json();
            if (data.success) {
                showToast('代理配置已保存', 'success');
                updateProxyStatus(proxy);
                dom.settingsModal.classList.add('hidden');
            }
        } catch (e) {
            showToast('保存设置失败', 'error');
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = 'toast';
        const icon = type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info');
        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
        dom.toastContainer.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode === dom.toastContainer) {
                dom.toastContainer.removeChild(toast);
            }
        }, 3200);
    }

    function formatHeat(num) {
        const n = Number(num);
        if (!Number.isFinite(n) || n <= 0) return '0';
        if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
        if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
        return n.toLocaleString();
    }

    function formatPublishDate(timestamp) {
        if (!timestamp) return '刚刚';
        const date = new Date(timestamp * 1000);
        const now = new Date();
        const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
        if (diffHours < 1) return '刚刚';
        if (diffHours < 24) return `${diffHours}小时前`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 30) return `${diffDays}天前`;
        return `${date.getMonth() + 1}月${date.getDate()}日`;
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ── Event Bindings ──────────────────────────────────────────────
    function bindEvents() {
        // Platform Navigation
        dom.navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const plat = btn.dataset.platform;
                if (plat === state.platform) return;

                dom.navBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                state.platform = plat;
                const config = PLATFORM_CONFIG[plat] || { name: plat, color: '#38bdf8' };
                dom.platformTitle.textContent = config.name;
                dom.platformStatusBadge.textContent = config.badge || '实时聚合中';

                // Set Accent Color
                document.documentElement.style.setProperty('--accent', config.color);
                document.documentElement.style.setProperty('--glow', config.glow);

                loadData(true);
            });
        });

        // Metric Mode Toggle
        dom.btnMetricSingle.addEventListener('click', () => {
            if (state.metricMode === 'single') return;
            state.metricMode = 'single';
            dom.btnMetricSingle.classList.add('active');
            dom.btnMetricTopic.classList.remove('active');
            loadData(true);
        });

        dom.btnMetricTopic.addEventListener('click', () => {
            if (state.metricMode === 'topic') return;
            state.metricMode = 'topic';
            dom.btnMetricTopic.classList.add('active');
            dom.btnMetricSingle.classList.remove('active');
            loadData(true);
        });

        // Back from Topic Drilldown
        dom.btnBackToTopics.addEventListener('click', closeTopicDrilldown);

        // Search Input
        dom.searchInput.addEventListener('input', (e) => {
            dom.searchClearBtn.classList.toggle('hidden', !e.target.value);
        });

        dom.searchBtn.addEventListener('click', () => {
            state.searchQuery = dom.searchInput.value.trim();
            loadData(true);
        });

        dom.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                state.searchQuery = dom.searchInput.value.trim();
                loadData(true);
            }
        });

        dom.searchClearBtn.addEventListener('click', () => {
            dom.searchInput.value = '';
            dom.searchClearBtn.classList.add('hidden');
            state.searchQuery = '';
            loadData(true);
        });

        // Global Shortcut: Ctrl + K
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                dom.searchInput.focus();
            }
        });

        // Category Chips
        dom.filterChips.forEach(chip => {
            chip.addEventListener('click', () => {
                dom.filterChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                state.category = chip.dataset.category;
                loadData(true);
            });
        });

        // Time Chips
        dom.timeChips.forEach(chip => {
            chip.addEventListener('click', () => {
                dom.timeChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                state.timeRange = chip.dataset.time;
                loadData(true);
            });
        });

        // View Switcher (Feed vs 3D Globe)
        dom.viewSwitchBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                if (view === state.view) return;

                dom.viewSwitchBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.view = view;

                if (view === 'globe') {
                    dom.gridScrollArea.classList.add('hidden');
                    dom.categoryFiltersContainer.classList.add('hidden');
                    dom.globeView.classList.remove('hidden');
                    if (!globeRadar.isInitialized) {
                        globeRadar.init(dom.globeStage);
                    }
                    globeRadar.updatePoints(state.geoHotspots);
                } else {
                    dom.globeView.classList.add('hidden');
                    dom.categoryFiltersContainer.classList.remove('hidden');
                    dom.gridScrollArea.classList.remove('hidden');
                }
            });
        });

        // Refresh Button
        dom.refreshBtn.addEventListener('click', () => {
            loadData(true);
        });

        // Scroll Pagination
        dom.gridScrollArea.addEventListener('scroll', handleScrollPagination);

        // Player Modal Danmaku Controls
        dom.modalDanmakuToggle.addEventListener('click', () => {
            danmakuEngine.toggle(dom.modalDanmakuScreen, dom.modalDanmakuToggle);
        });

        dom.modalDanmakuSend.addEventListener('click', sendModalDanmaku);
        dom.modalDanmakuInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendModalDanmaku();
        });

        function sendModalDanmaku() {
            const val = dom.modalDanmakuInput.value.trim();
            if (!val) return;
            danmakuEngine.emit(dom.modalDanmakuScreen, val, true);
            dom.modalDanmakuInput.value = '';
            showToast('弹幕发射成功！', 'success');
        }

        // Close Player Modal
        dom.closePlayerModalBtn.addEventListener('click', closePlayerModal);
        dom.playerModal.addEventListener('click', (e) => {
            if (e.target === dom.playerModal) closePlayerModal();
        });

        // Player Modal Action Tools
        dom.modalCopyLinkBtn.addEventListener('click', () => copyVideoLink(state.activeVideo));
        dom.modalSniffBtn.addEventListener('click', () => sniffVideoDirectStream(state.activeVideo, dom.modalSniffBtn));
        dom.modalDownloadBtn.addEventListener('click', () => downloadVideo(state.activeVideo));

        // Drawer Action Tools
        if (dom.btnCopyLink) dom.btnCopyLink.addEventListener('click', () => copyVideoLink(state.activeVideo));
        if (dom.btnParseStream) dom.btnParseStream.addEventListener('click', () => sniffVideoDirectStream(state.activeVideo, dom.btnParseStream));
        if (dom.btnDownloadVideo) dom.btnDownloadVideo.addEventListener('click', () => downloadVideo(state.activeVideo));
        if (dom.btnCopyStream) dom.btnCopyStream.addEventListener('click', () => {
            navigator.clipboard.writeText(dom.streamUrlInput.value).then(() => {
                showToast('已复制视频直链地址！', 'success');
            });
        });
        if (dom.closeDrawerBtn) dom.closeDrawerBtn.addEventListener('click', () => {
            dom.detailDrawer.classList.add('hidden');
        });

        // Settings Modal
        dom.settingsBtn.addEventListener('click', () => {
            dom.settingsModal.classList.remove('hidden');
        });
        dom.closeModalBtn.addEventListener('click', () => {
            dom.settingsModal.classList.add('hidden');
        });
        dom.settingsModal.addEventListener('click', (e) => {
            if (e.target === dom.settingsModal) dom.settingsModal.classList.add('hidden');
        });
        dom.btnSaveSettings.addEventListener('click', saveSettings);
        dom.proxyPills.forEach(pill => {
            pill.addEventListener('click', () => {
                dom.settingProxy.value = pill.dataset.url;
            });
        });

        // Auth Modal & Role Switching
        dom.openLoginBtn.addEventListener('click', () => {
            dom.authModal.classList.remove('hidden');
        });
        dom.closeAuthModalBtn.addEventListener('click', () => {
            dom.authModal.classList.add('hidden');
        });
        dom.authModal.addEventListener('click', (e) => {
            if (e.target === dom.authModal) dom.authModal.classList.add('hidden');
        });

        dom.btnRoleAdmin.addEventListener('click', () => switchRole('admin'));
        dom.btnRolePro.addEventListener('click', () => switchRole('pro'));
        dom.btnRoleDemo.addEventListener('click', () => switchRole('user'));

        dom.authTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                dom.authTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.dataset.tab;
                dom.loginForm.classList.toggle('hidden', target !== 'login');
                dom.registerForm.classList.toggle('hidden', target !== 'register');
            });
        });

        // Login Form
        dom.loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = dom.loginUsername.value.trim();
            const password = dom.loginPassword.value.trim();
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (data.success) {
                    setUserSession(data.user);
                    showToast(`欢迎回来，${data.user.nickname || data.user.username}`, 'success');
                    dom.authModal.classList.add('hidden');
                } else {
                    dom.loginMsgBox.textContent = data.message || '登录失败';
                    dom.loginMsgBox.className = 'auth-message-box error';
                    dom.loginMsgBox.classList.remove('hidden');
                }
            } catch (err) {
                showToast('登录请求失败', 'error');
            }
        });

        // Register Form
        dom.registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = dom.regUsername.value.trim();
            const nickname = dom.regNickname.value.trim() || username;
            const password = dom.regPassword.value.trim();
            try {
                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, nickname, password })
                });
                const data = await res.json();
                if (data.success) {
                    setUserSession(data.user);
                    showToast(`注册成功！欢迎加入，${data.user.nickname}`, 'success');
                    dom.authModal.classList.add('hidden');
                } else {
                    dom.regMsgBox.textContent = data.message || '注册失败';
                    dom.regMsgBox.className = 'auth-message-box error';
                    dom.regMsgBox.classList.remove('hidden');
                }
            } catch (err) {
                showToast('注册请求失败', 'error');
            }
        });

        // Logout
        dom.authLogoutBtn.addEventListener('click', async () => {
            try {
                await fetch('/api/auth/logout', { method: 'POST' });
            } catch (e) {}
            setUserSession({
                username: 'demo',
                nickname: '体验用户',
                role: 'user',
                avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=demo'
            });
            showToast('已退出登录', 'info');
        });
    }

    // ── Application Bootstrapping ───────────────────────────────────
    async function init() {
        bindEvents();
        await initUserSession();
        await loadSettings();
        await loadData(true);
    }

    init();
});
