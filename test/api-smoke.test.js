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

        // 6. Test Geo Hotspots (no 1000 capping)
        const geoRes = await fetch(`http://127.0.0.1:${port}/api/geo-hotspots?platform=bilibili`);
        assert.equal(geoRes.status, 200);
        const geoData = await geoRes.json();
        assert.equal(geoData.success, true);
        assert.ok(Array.isArray(geoData.list) || Array.isArray(geoData.hotspots));

        // 7. Test all 7 platforms for trends & expanded categories
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

            // Platform-specific landmark top heat assertions
            if (platform === 'douyin') {
                assert.ok(topAllHeat >= 2000000000, `Douyin top heat must be >= 20亿, got: ${topAllHeat} (${dataAll.list[0]?.playCount})`);
            } else if (platform === 'youtube') {
                assert.ok(topAllHeat >= 5000000000, `YouTube top heat must be >= 50亿, got: ${topAllHeat} (${dataAll.list[0]?.playCount})`);
            } else if (platform === 'tiktok') {
                assert.ok(topAllHeat >= 2000000000, `TikTok top heat must be >= 20亿, got: ${topAllHeat} (${dataAll.list[0]?.playCount})`);
            } else if (platform === 'kuaishou') {
                assert.ok(topAllHeat >= 1500000000, `Kuaishou top heat must be >= 15亿, got: ${topAllHeat} (${dataAll.list[0]?.playCount})`);
            } else if (platform === 'xiaohongshu') {
                assert.ok(topAllHeat >= 1000000000, `Xiaohongshu top heat must be >= 10亿, got: ${topAllHeat} (${dataAll.list[0]?.playCount})`);
            } else if (platform === 'bilibili') {
                assert.ok(topAllHeat >= 100000000, `Bilibili top heat must be >= 1亿, got: ${topAllHeat} (${dataAll.list[0]?.playCount})`);
            }

            // Verify items have required properties and Chinese play counts
            for (const item of dataAll.list) {
                assert.ok(item.title, `Item on ${platform} must have title`);
                assert.ok(item.url, `Item on ${platform} must have url`);
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
