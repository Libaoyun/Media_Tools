'use strict';

const assert = require('node:assert/strict');
const { normalizeTimestamp, parseHeat, prepareVideoList } = require('../lib/video-pipeline');

function run() {
    assert.equal(parseHeat('12.5万'), 125000);
    assert.equal(parseHeat('1.2M views'), 1200000);
    assert.equal(parseHeat('8,765'), 8765);

    assert.equal(normalizeTimestamp(1720000000000), 1720000000);
    assert.equal(normalizeTimestamp(1720000000), 1720000000);

    const now = 2_000_000_000;
    const list = prepareVideoList([
        { id: 'old', title: 'old', platform: 'Bilibili', pubdate: now - 8 * 86400, playRaw: 9_000_000 },
        { id: 'warm', title: 'warm', platform: 'Bilibili', pubdate: now - 2 * 86400, playCount: '8万' },
        { id: 'hot', title: 'hot', platform: 'Bilibili', pubdate: now - 86400, playCount: '12万' },
        { id: 'unknown', title: 'unknown', platform: 'Bilibili', playCount: '99万' },
        { id: 'hot', title: 'duplicate', platform: 'Bilibili', pubdate: now - 3600, playCount: '1万' }
    ], { timeRange: '7days', now });

    assert.deepEqual(list.map(item => item.id), ['hot', 'warm']);
    assert.deepEqual(list.map(item => item.playRaw), [120000, 80000]);
    console.log('video-pipeline tests passed');
}

run();
