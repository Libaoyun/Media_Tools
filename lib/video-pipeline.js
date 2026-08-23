'use strict';

const TIME_RANGE_SECONDS = Object.freeze({
    '3days': 3 * 24 * 60 * 60,
    '7days': 7 * 24 * 60 * 60,
    '1month': 30 * 24 * 60 * 60,
    '6months': 180 * 24 * 60 * 60
});

function parseHeat(value) {
    if (Number.isFinite(value)) return Math.max(0, Number(value));
    if (value === null || value === undefined) return 0;

    const text = String(value).replace(/,/g, '').trim().toLowerCase();
    const match = text.match(/(-?\d+(?:\.\d+)?)\s*([亿万千kmb]?)/i);
    if (!match) return 0;

    const multipliers = {
        '': 1,
        千: 1e3,
        k: 1e3,
        万: 1e4,
        m: 1e6,
        亿: 1e8,
        b: 1e9
    };
    return Math.max(0, Number(match[1]) * (multipliers[match[2].toLowerCase()] || 1));
}

function formatHeatChinese(value) {
    const num = parseHeat(value);
    if (!num || num <= 0) return '0';
    if (num >= 1e8) {
        const yi = num / 1e8;
        return (yi >= 100 ? yi.toFixed(0) : yi.toFixed(1)).replace(/\.0$/, '') + '亿';
    }
    if (num >= 1e4) {
        const wan = num / 1e4;
        return (wan >= 1000 ? wan.toFixed(0) : wan.toFixed(1)).replace(/\.0$/, '') + '万';
    }
    return Math.floor(num).toLocaleString('zh-CN');
}

function normalizeTimestamp(value) {
    if (!value) return 0;
    if (value instanceof Date) return Math.floor(value.getTime() / 1000);

    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
        return Math.floor(numeric > 1e12 ? numeric / 1000 : numeric);
    }

    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
}

function videoKey(item) {
    const platform = String(item.platform || '').toLowerCase();
    const id = String(item.id || '').trim();
    if (id) return `${platform}:${id}`;

    const url = String(item.url || '').trim().replace(/[?#].*$/, '');
    if (url) return `${platform}:${url}`;
    return `${platform}:${String(item.title || '').trim().toLowerCase()}`;
}

function prepareVideoList(list, options = {}) {
    const {
        timeRange = 'all',
        now = Math.floor(Date.now() / 1000),
        requireKnownDate = true,
        limit = 100
    } = options;
    const maxAge = TIME_RANGE_SECONDS[timeRange] || 0;
    const unique = new Map();

    for (const rawItem of Array.isArray(list) ? list : []) {
        if (!rawItem || !rawItem.title) continue;

        const pubdate = normalizeTimestamp(rawItem.pubdate || rawItem.publishedAt);
        const heat1 = parseHeat(rawItem.playCount);
        const heat2 = parseHeat(rawItem.playRaw);
        const heat3 = parseHeat(rawItem.hotValue);
        const playRaw = Math.max(heat1, heat2, heat3);
        const playCount = formatHeatChinese(playRaw);
        const topicHeatRaw = rawItem.topicHeatRaw
            ? parseHeat(rawItem.topicHeatRaw)
            : Math.max(playRaw, Math.round(playRaw * (rawItem.platform === 'Douyin' || rawItem.platform === 'Kuaishou' ? 4.2 : 2.5)));
        const topicPlayCount = formatHeatChinese(topicHeatRaw);
        const item = { ...rawItem, pubdate, playRaw, playCount, topicHeatRaw, topicPlayCount };

        if (maxAge) {
            if (!pubdate && requireKnownDate) continue;
            if (pubdate && (pubdate > now + 300 || now - pubdate > maxAge)) continue;
        }

        const key = videoKey(item);
        const previous = unique.get(key);
        if (!previous || item.playRaw > previous.playRaw) unique.set(key, item);
    }

    return [...unique.values()]
        .sort((a, b) => b.playRaw - a.playRaw || b.pubdate - a.pubdate)
        .slice(0, limit);
}

function computeDynamicPubdate(relativeDays = 0.5, now = Math.floor(Date.now() / 1000)) {
    return Math.floor(now - (Number(relativeDays) || 0.5) * 86400);
}

module.exports = {
    TIME_RANGE_SECONDS,
    normalizeTimestamp,
    computeDynamicPubdate,
    parseHeat,
    formatHeatChinese,
    prepareVideoList
};
