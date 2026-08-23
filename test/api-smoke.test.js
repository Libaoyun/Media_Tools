'use strict';

const assert = require('node:assert/strict');
const app = require('../server');

async function run() {
    const server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const { port } = server.address();

    try {
        // 1. Settings test
        const settingsResponse = await fetch(`http://127.0.0.1:${port}/api/settings`);
        const settings = await settingsResponse.json();
        assert.equal(settingsResponse.status, 200);
        assert.equal(settings.success, true);

        // 2. Invalid platform test
        const invalidResponse = await fetch(`http://127.0.0.1:${port}/api/trends?platform=invalid&category=all&timeRange=7days`);
        assert.equal(invalidResponse.status, 400);

        // 3. Static assets
        const globeBundle = await fetch(`http://127.0.0.1:${port}/vendor/globe.gl.min.js`, { method: 'HEAD' });
        const globeTexture = await fetch(`http://127.0.0.1:${port}/vendor/earth-blue-marble.jpg`, { method: 'HEAD' });
        const globeTopology = await fetch(`http://127.0.0.1:${port}/vendor/earth-topology.png`, { method: 'HEAD' });
        assert.equal(globeBundle.status, 200);
        assert.equal(globeTexture.status, 200);
        assert.equal(globeTopology.status, 200);

        // 4. Security checks
        const blockedProxy = await fetch(`http://127.0.0.1:${port}/api/proxy-image?url=${encodeURIComponent('http://127.0.0.1/private')}`);
        assert.equal(blockedProxy.status, 400);

        // 5. Test Topic Leaderboard and Drilldown API
        const topicsResponse = await fetch(`http://127.0.0.1:${port}/api/topics?platform=douyin&category=all`);
        assert.equal(topicsResponse.status, 200);
        const topicsData = await topicsResponse.json();
        assert.equal(topicsData.success, true);
        assert.ok(Array.isArray(topicsData.list) && topicsData.list.length >= 5, 'Should return topic leaderboard items');
        
        // Assert top topic
        const topTopic = topicsData.list[0];
        assert.ok(topTopic.title && topTopic.title.length > 0, 'Top topic must have title');
        assert.ok(topTopic.heatRaw >= 100000000, 'Top topic should have significant heat');
        assert.ok(topTopic.heatDisplay.includes('亿') || topTopic.heatDisplay.includes('万'), 'Topic heat must be formatted');

        // Test Topic Drilldown
        const topicVideosRes = await fetch(`http://127.0.0.1:${port}/api/search-topic?query=${encodeURIComponent(topTopic.title)}&topicId=${topTopic.id}`);
        assert.equal(topicVideosRes.status, 200);
        const topicVideosData = await topicVideosRes.json();
        assert.equal(topicVideosData.success, true);
        assert.ok(Array.isArray(topicVideosData.list) && topicVideosData.list.length > 0, 'Topic drilldown should return related videos');
        
        // Verify videos are sorted by playRaw descending
        for (let i = 0; i < topicVideosData.list.length - 1; i++) {
            assert.ok(
                (topicVideosData.list[i].playRaw || 0) >= (topicVideosData.list[i + 1].playRaw || 0),
                'Topic videos must be sorted from highest to lowest playback'
            );
        }

        // 6. Test Danmaku API (Authentic danmaku parsing)
        const danmakuRes = await fetch(`http://127.0.0.1:${port}/api/danmaku?bvid=BV1bW411n7fY`);
        assert.equal(danmakuRes.status, 200);
        const danmakuData = await danmakuRes.json();
        assert.equal(danmakuData.success, true);
        assert.ok(danmakuData.count > 0, 'Danmaku count should be greater than 0');
        assert.ok(Array.isArray(danmakuData.list), 'Danmaku list should be an array');
        assert.ok(danmakuData.list[0].text, 'Danmaku item must have text');
        assert.ok(typeof danmakuData.list[0].time === 'number', 'Danmaku item must have time');
        assert.ok(danmakuData.list[0].color, 'Danmaku item must have color');

        // 7. Test MediaTools Universal Extraction (/api/parse & /api/analyze & /api/download)
        const parseRes = await fetch(`http://127.0.0.1:${port}/api/parse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: 'https://www.bilibili.com/video/BV1bW411n7fY' })
        });
        assert.equal(parseRes.status, 200);
        const parseData = await parseRes.json();
        assert.equal(parseData.success, true);
        assert.ok(parseData.videoUrl, 'Parsed video should have playable stream URL');
        assert.ok(parseData.title, 'Parsed video should have title');

        const title = parseData.title;
        const description = parseData.description;
        const analyzeRes = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description })
        });
        assert.equal(analyzeRes.status, 200);
        const analyzeData = await analyzeRes.json();
        assert.equal(analyzeData.success, true);
        assert.ok(analyzeData.category, 'AI should classify video category');
        assert.ok(Array.isArray(analyzeData.goldenHooks) && analyzeData.goldenHooks.length >= 3, 'AI should return 3 golden hooks');
        assert.ok(Array.isArray(analyzeData.storyboardSuggestions) && analyzeData.storyboardSuggestions.length >= 3, 'AI should return storyboard suggestions');

        // 7.1 Test Transcript Extraction (/api/transcript)
        const transcriptRes = await fetch(`http://127.0.0.1:${port}/api/transcript`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description, duration: 30 })
        });
        assert.equal(transcriptRes.status, 200);
        const transcriptData = await transcriptRes.json();
        assert.equal(transcriptData.success, true);
        assert.ok(Array.isArray(transcriptData.transcript) && transcriptData.transcript.length >= 3, 'Should generate structured transcript lines');
        assert.ok(transcriptData.srtContent.includes('-->'), 'Should generate standard SRT formatted subtitles');
        assert.ok(transcriptData.fullText && transcriptData.plainText, 'Should provide full plain text transcript');

        // 7.2 Test Complex Douyin Share Text extraction
        const douyinShareText = '2.02 L@J.Vy Agb:/ :0pm 06/11 “谎言不会伤人、真像才是快刀！” # 兔娘# 婚姻# 彩礼# inmyfeelings# 创作者扶持计划  https://v.douyin.com/E-4whck_rfQ/ 复制此链接，打开Dou音搜索，直接观看视频！';
        const douyinParseRes = await fetch(`http://127.0.0.1:${port}/api/parse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: douyinShareText })
        });
        assert.equal(douyinParseRes.status, 200);
        const douyinData = await douyinParseRes.json();
        assert.equal(douyinData.success, true);
        assert.equal(douyinData.platform, 'Douyin');
        assert.ok(douyinData.videoUrl && douyinData.videoUrl.length > 0, 'Douyin parsed video must have direct stream URL');
        assert.ok(douyinData.title && douyinData.title.length > 0, 'Douyin parsed video must have title');
        assert.ok(douyinData.originUrl.includes('douyin.com/video/'), 'Douyin originUrl must be direct video post link');
        assert.ok(douyinData.transcript && douyinData.transcript.transcript.length >= 3, 'Douyin parser should attach transcript');
        assert.ok(douyinData.aiAnalysis && douyinData.aiAnalysis.goldenHooks.length >= 3, 'Douyin parser should attach AI analysis');

        // 7.2 Test Download Endpoint (/api/download)
        const downloadRes = await fetch(`http://127.0.0.1:${port}/api/download?videoUrl=${encodeURIComponent(douyinData.videoUrl)}&title=${encodeURIComponent(douyinData.title)}`, {
            method: 'HEAD'
        });
        assert.equal(downloadRes.status, 200);
        assert.ok(downloadRes.headers.get('content-disposition')?.includes('attachment'), 'Download endpoint must set attachment disposition');

        // 8. Test Geo Hotspots (no 1000 capping)
        const geoRes = await fetch(`http://127.0.0.1:${port}/api/geo-hotspots?platform=bilibili`);
        assert.equal(geoRes.status, 200);
        const geoData = await geoRes.json();
        assert.equal(geoData.success, true);
        assert.ok(Array.isArray(geoData.list) || Array.isArray(geoData.hotspots));

        // 9. Test all 7 platforms for trends & expanded categories
        const platforms = ['bilibili', 'douyin', 'youtube', 'tiktok', 'twitter', 'xiaohongshu', 'kuaishou'];
        const categories = ['all', 'comedy', 'ent', 'fashion', 'pets', 'wildlife', 'tech', 'marketing', 'kuso', 'animal'];

        for (const platform of platforms) {
            // Test default 'all' category
            const resAll = await fetch(`http://127.0.0.1:${port}/api/trends?platform=${platform}&category=all&timeRange=all`);
            assert.equal(resAll.status, 200, `Platform ${platform} all category failed`);
            const dataAll = await resAll.json();
            assert.equal(dataAll.success, true);
            assert.ok(Array.isArray(dataAll.list), `${platform} should return a list array`);
            assert.ok(dataAll.list.length >= 15, `${platform} all list should have at least 15 items, got: ${dataAll.list.length}`);

            const topAllHeat = dataAll.list[0]?.playRaw || 0;

            // Single video items must have substantial heat (>= 1000万)
            assert.ok(topAllHeat >= 10000000, `${platform} top heat must be >= 1000万, got: ${topAllHeat} (${dataAll.list[0]?.playCount})`);

            // Verify items have required properties, authentic video URLs (never search URLs), and Chinese play counts
            for (const item of dataAll.list) {
                assert.ok(item.title, `Item on ${platform} must have title`);
                assert.ok(item.url, `Item on ${platform} must have url`);
                assert.ok(!item.url.includes('/search'), `Single video on ${platform} must NOT be a search URL, got: ${item.url}`);
                assert.ok(item.cover, `Item on ${platform} must have cover`);
                assert.ok(typeof item.playCount === 'string', `${platform} item must have playCount string`);
                assert.ok(!/[kmb]\s*views?/i.test(item.playCount), `playCount on ${platform} should be Chinese format, got: ${item.playCount}`);
            }

            // Test subcategories and time filtering
            for (const category of categories.slice(1)) {
                const resCat = await fetch(`http://127.0.0.1:${port}/api/trends?platform=${platform}&category=${category}&timeRange=all`);
                assert.equal(resCat.status, 200, `Platform ${platform} category ${category} failed`);
                const dataCat = await resCat.json();
                assert.equal(dataCat.success, true);
                assert.ok(Array.isArray(dataCat.list));
                assert.ok(dataCat.list.length >= 10, `${platform} ${category} should have >= 10 items, got ${dataCat.list.length}`);

                const topCatHeat = dataCat.list[0]?.playRaw || 0;
                assert.ok(
                    topAllHeat >= topCatHeat,
                    `Platform ${platform}: 'all' top heat (${topAllHeat}) must be >= '${category}' top heat (${topCatHeat})`
                );

                const resCat7d = await fetch(`http://127.0.0.1:${port}/api/trends?platform=${platform}&category=${category}&timeRange=7days`);
                assert.equal(resCat7d.status, 200);
                const dataCat7d = await resCat7d.json();
                assert.equal(dataCat7d.success, true);
                assert.ok(dataCat7d.list.length >= 5, `${platform} ${category} 7days should have abundant items, got ${dataCat7d.list.length}`);
            }

            // Test search endpoint with multi-page support
            const resSearch = await fetch(`http://127.0.0.1:${port}/api/search?platform=${platform}&query=${encodeURIComponent('热门')}&category=all&timeRange=all&page=1`);
            assert.equal(resSearch.status, 200, `Search on platform ${platform} failed`);
            const dataSearch = await resSearch.json();
            assert.equal(dataSearch.success, true);
            assert.ok(Array.isArray(dataSearch.list));
            assert.ok(dataSearch.list.length >= 15, `Search on ${platform} should return >= 15 items, got: ${dataSearch.list.length}`);
        }

        console.log('All 7 platforms, topic leaderboards, drill-down endpoints, and categories smoke tests passed successfully!');
    } finally {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
}

run().catch(error => {
    console.error('Smoke test failure:', error);
    process.exitCode = 1;
});
