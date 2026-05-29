const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf-8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
    if (line.toLowerCase().includes('pro') || line.toLowerCase().includes('password')) {
        console.log(`${idx + 1}: ${line.trim()}`);
    }
});
