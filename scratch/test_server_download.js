const axios = require('axios');
const fs = require('fs');
const path = require('path');

const videoUrl = 'https://rr5---sn-o097znzr.googlevideo.com/videoplayback?expire=1779273812&ei=9DsNau_SH8Xwir4P9JyekQo&ip=2602%3Afeda%3Add0%3A7f56%3Ac0fe%3A7334%3Ac5dc%3A9ac8&id=o-ADJApYYgIAvxd6SfHB7ExKxAjZNNYmtxeteMR5duw8mT&itag=18&source=youtube&requiressl=yes&xpc=EgVo2aDSNQ%3D%3D&cps=1258&met=1779252212%2C&mh=7c&mm=31%2C26&mn=sn-o097znzr%2Csn-a5m7lnld&ms=au%2Conr&mv=m&mvi=5&pl=44&rms=au%2Cau&initcwndbps=4452500&bui=AbKmrwpigi_EhwSk4HBCF0ZBXsKGZq8DHnWsSIf0aqAfAZ3_-3jf78nD144ctloYmlO2gFUUPx2-qByT&spc=96Xrv0lGXVkPiXvuRDf_R4YyfaSlrxKsJm8F--hiMlwuuAO_2doGKF_BqqFsPQ9ZH0C0qo0X_w82gw&vprv=1&svpuc=1&mime=video%2Fmp4&ns=eVLTFvj4rNxU4z6UGsLFnz4V&rqh=1&cnr=14&ratebypass=yes&dur=213.089&lmt=1766960953317159&mt=1779250615&fvip=2&fexp=51565115%2C51565681&c=MWEB&sefc=1&txp=5538534&n=eic2_OZQlreH8w&sparams=expire%2Cei%2Cip%2Cid%2Citag%2Csource%2Crequiressl%2Cxpc%2Cbui%2Cspc%2Cvprv%2Csvpuc%2Cmime%2Cns%2Crqh%2Ccnr%2Cratebypass%2Cdur%2Clmt&lsparams=cps%2Cmet%2Cmh%2Cmm%2Cmn%2Cms%2Cmv%2Cmvi%2Cpl%2Crms%2Cinitcwndbps&lsig=APaTxxMwRgIhAIgbFEXgSPyEIArac_OmMMLBtKmwNgTp0q_qT7NWn9V4AiEAyBbWF04JSn_oyCAGABkcpj4b3ttJbq-7xHr907UO4jE%3D&sig=AHEqNM4wRAIgEq1RPvV9vkyBtE212afvZMdfIRP5JAwR3wECWoROO8ACIAQGDlE4o2YqT6qM6jjp30OJjne6vrr131qsSywZ79b1&cpn=6To8yAp4bs7it-VH&cver=2.20260519.01.00&ptk=youtube_single&oid=QuEoptyF_C_7jHTEUMsRjA&ptkn=uAXFkgsw1L7xaCfnd5JJOw&pltype=content';

async function testDownload() {
    try {
        console.log('Testing download proxy...');
        const response = await axios({
            method: 'GET',
            url: `http://localhost:3000/api/download?videoUrl=${encodeURIComponent(videoUrl)}&title=test_youtube`,
            responseType: 'stream'
        });
        console.log('Status code:', response.status);
        console.log('Headers:', response.headers);
        
        // Pipe a small amount to verify
        const dest = fs.createWriteStream(path.join(__dirname, 'test_output.mp4'));
        response.data.pipe(dest);
        
        await new Promise((resolve, reject) => {
            dest.on('finish', resolve);
            dest.on('error', reject);
            setTimeout(() => {
                response.data.destroy();
                dest.end();
                resolve();
            }, 3000); // stop after 3 seconds
        });
        console.log('Successfully proxy-downloaded some data.');
    } catch (e) {
        console.error('Error during download:', e.message);
        if (e.response) {
            console.error('Error status:', e.response.status);
            // Read first 100 bytes of response
            try {
                const data = await e.response.data.read(100);
                console.error('Response data:', data?.toString());
            } catch (err) {}
        }
    }
}

testDownload();
