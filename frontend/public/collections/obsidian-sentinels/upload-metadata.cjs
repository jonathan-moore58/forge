#!/usr/bin/env node
/**
 * Update NFT metadata JSONs with IPFS image CIDs, then upload JSONs to IPFS too.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const IPFS_ENDPOINT = 'https://ipfs.opnet.org/api/v0/add';
const NFT_DIR = path.join(__dirname, 'nfts');
const CID_MAP_PATH = path.join(__dirname, 'ipfs-cids.json');
const IPFS_GATEWAY = 'https://ipfs.opnet.org/ipfs/';

// Load SVG CID mapping
const svgCids = JSON.parse(fs.readFileSync(CID_MAP_PATH, 'utf8'));

async function uploadBuffer(buf, fileName) {
    return new Promise((resolve, reject) => {
        const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
        const bodyParts = [];
        bodyParts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/json\r\n\r\n`));
        bodyParts.push(buf);
        bodyParts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
        const body = Buffer.concat(bodyParts);

        const url = new URL(`${IPFS_ENDPOINT}?pin=true`);
        const req = https.request({
            hostname: url.hostname,
            port: 443,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length,
            },
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch { reject(new Error(`Parse error: ${data}`)); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function main() {
    console.log('Updating metadata with IPFS image URIs and uploading...\n');

    const jsonCids = {};
    const files = fs.readdirSync(NFT_DIR).filter(f => f.endsWith('.json')).sort((a, b) => parseInt(a) - parseInt(b));

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = path.join(NFT_DIR, file);
        const metadata = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Update image field to IPFS URI
        const svgFile = file.replace('.json', '.svg');
        if (svgCids[svgFile]) {
            metadata.image = `ipfs://${svgCids[svgFile]}`;
        }

        // Write updated JSON back to disk
        const updatedJson = JSON.stringify(metadata, null, 2);
        fs.writeFileSync(filePath, updatedJson);

        // Upload to IPFS
        try {
            const result = await uploadBuffer(Buffer.from(updatedJson), file);
            jsonCids[file] = result.Hash;
            if ((i + 1) % 10 === 0 || i === files.length - 1) {
                console.log(`  Uploaded ${i + 1}/${files.length} — ${file} → ${result.Hash}`);
            }
        } catch (err) {
            console.error(`  FAILED ${file}: ${err.message}`);
        }
    }

    // Save JSON CID mapping
    const mapPath = path.join(__dirname, 'ipfs-metadata-cids.json');
    fs.writeFileSync(mapPath, JSON.stringify(jsonCids, null, 2));
    console.log(`\nMetadata CID mapping saved to: ${mapPath}`);

    // Print final summary
    console.log('\n=== IPFS DEPLOYMENT SUMMARY ===\n');
    console.log(`Icon:     ipfs://QmTgBDEmaTGo46k5u1EpeTV6Vg2q1YxLHc2UTxQhzzAiEw`);
    console.log(`Banner:   ipfs://QmcMHTqhBQZ3QCBN2eNEVt3VunE6H39tV77oWMeSzmP31R`);
    console.log(`Hidden:   ipfs://QmWFevwmW2A7u2j5sBeS4DDiXKLe3eWmbaFHBCG5jasTkK`);
    console.log(`\nGateway links:`);
    console.log(`  Icon:   ${IPFS_GATEWAY}QmTgBDEmaTGo46k5u1EpeTV6Vg2q1YxLHc2UTxQhzzAiEw`);
    console.log(`  Banner: ${IPFS_GATEWAY}QmcMHTqhBQZ3QCBN2eNEVt3VunE6H39tV77oWMeSzmP31R`);
    console.log(`  Hidden: ${IPFS_GATEWAY}QmWFevwmW2A7u2j5sBeS4DDiXKLe3eWmbaFHBCG5jasTkK`);
    console.log(`\nSample NFT metadata:`);
    console.log(`  #1:  ${IPFS_GATEWAY}${jsonCids['1.json']}`);
    console.log(`  #25: ${IPFS_GATEWAY}${jsonCids['25.json']}`);
    console.log(`  #50: ${IPFS_GATEWAY}${jsonCids['50.json']}`);
}

main().catch(console.error);
