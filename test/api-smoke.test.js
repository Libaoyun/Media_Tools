'use strict';

const assert = require('node:assert/strict');
const app = require('../server');

async function run() {
    const server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const { port } = server.address();

    try {
        const settingsResponse = await fetch(`http://127.0.0.1:${port}/api/settings`);
        const settings = await settingsResponse.json();
        assert.equal(settingsResponse.status, 200);
        assert.equal(settings.success, true);

        const invalidResponse = await fetch(`http://127.0.0.1:${port}/api/trends?platform=invalid&category=all&timeRange=7days`);
        assert.equal(invalidResponse.status, 400);

        const globeBundle = await fetch(`http://127.0.0.1:${port}/vendor/globe.gl.min.js`, { method: 'HEAD' });
        const globeTexture = await fetch(`http://127.0.0.1:${port}/vendor/earth-dark.jpg`, { method: 'HEAD' });
        assert.equal(globeBundle.status, 200);
        assert.equal(globeTexture.status, 200);

        const blockedProxy = await fetch(`http://127.0.0.1:${port}/api/proxy-image?url=${encodeURIComponent('http://127.0.0.1/private')}`);
        assert.equal(blockedProxy.status, 400);

        const invalidProxy = await fetch(`http://127.0.0.1:${port}/api/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ proxy: 'socks5://127.0.0.1:1080' })
        });
        assert.equal(invalidProxy.status, 400);
        console.log('api smoke tests passed');
    } finally {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
