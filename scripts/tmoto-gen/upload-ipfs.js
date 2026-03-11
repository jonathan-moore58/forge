/**
 * TMOTO NFT Collection — Upload to IPFS via Pinata
 *
 * Usage:
 *   PINATA_JWT=<your-jwt> node upload-ipfs.js
 *
 * Or set PINATA_JWT in environment.
 *
 * Steps:
 *   1. Upload images folder → get images CID
 *   2. Update metadata JSON files with real images CID
 *   3. Upload metadata folder → get metadata CID
 *   4. Output: hiddenURI = ipfs://<metadata-CID>/
 *
 * Free Pinata account: https://app.pinata.cloud (1GB free)
 */

const fs = require('fs');
const path = require('path');

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_API = 'https://api.pinata.cloud';

const IMAGES_DIR = path.join(__dirname, '..', '..', 'tmoto-assets', 'images');
const METADATA_DIR = path.join(__dirname, '..', '..', 'tmoto-assets', 'metadata');

async function pinDirectory(dirPath, name) {
    const FormData = (await import('form-data')).default;
    const form = new FormData();

    const files = fs.readdirSync(dirPath).sort();
    for (const file of files) {
        const filePath = path.join(dirPath, file);
        form.append('file', fs.createReadStream(filePath), {
            filepath: `${name}/${file}`,
        });
    }

    form.append('pinataMetadata', JSON.stringify({ name }));

    const response = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${PINATA_JWT}`,
            ...form.getHeaders(),
        },
        body: form,
        duplex: 'half',
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Pinata upload failed (${response.status}): ${text}`);
    }

    const result = await response.json();
    return result.IpfsHash;
}

async function main() {
    if (!PINATA_JWT) {
        console.error('ERROR: PINATA_JWT environment variable not set.');
        console.error('');
        console.error('Get a free Pinata account:');
        console.error('  1. Go to https://app.pinata.cloud');
        console.error('  2. Sign up (free — 1GB storage)');
        console.error('  3. Go to API Keys → New Key → copy the JWT');
        console.error('  4. Run: PINATA_JWT=<your-jwt> node upload-ipfs.js');
        process.exit(1);
    }

    console.log('TMOTO IPFS Upload');
    console.log('=================\n');

    // 1. Upload images
    console.log('[1/3] Uploading images to IPFS...');
    const imagesCID = await pinDirectory(IMAGES_DIR, 'tmoto-images');
    console.log(`  Images CID: ${imagesCID}`);
    console.log(`  Gateway: https://gateway.pinata.cloud/ipfs/${imagesCID}/`);
    console.log('');

    // 2. Update metadata with real images CID
    console.log('[2/3] Updating metadata with images CID...');
    const metaFiles = fs.readdirSync(METADATA_DIR).filter(f => f.endsWith('.json'));
    for (const file of metaFiles) {
        const filePath = path.join(METADATA_DIR, file);
        let content = fs.readFileSync(filePath, 'utf-8');
        content = content.replace(/IMAGES_CID_PLACEHOLDER/g, `ipfs://${imagesCID}`);
        fs.writeFileSync(filePath, content);
        console.log(`  Updated ${file}`);
    }
    console.log('');

    // 3. Upload metadata
    console.log('[3/3] Uploading metadata to IPFS...');
    const metadataCID = await pinDirectory(METADATA_DIR, 'tmoto-metadata');
    console.log(`  Metadata CID: ${metadataCID}`);
    console.log(`  Gateway: https://gateway.pinata.cloud/ipfs/${metadataCID}/`);
    console.log('');

    // Output
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  TMOTO IPFS Upload Complete!                    ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  Images CID:   ${imagesCID}`);
    console.log(`║  Metadata CID: ${metadataCID}`);
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  hiddenURI: ipfs://${metadataCID}/`);
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
    console.log('Use this as hiddenURI in Create Collection:');
    console.log(`  ipfs://${metadataCID}/`);
    console.log('');
    console.log('Token metadata URLs:');
    console.log(`  Token 1: ipfs://${metadataCID}/1.json`);
    console.log(`  Token 2: ipfs://${metadataCID}/2.json`);
    console.log('  ...');
}

main().catch(err => {
    console.error('Upload failed:', err.message);
    process.exit(1);
});
