/**
 * TMOTO NFT Collection — Upload to OPNet IPFS (ipfs.opnet.org)
 *
 * Uses curl for reliable multipart uploads to OPNet's IPFS endpoint.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const IPFS_ENDPOINT = 'https://ipfs.opnet.org/api/v0/add';
const IPFS_GATEWAY = 'https://ipfs.opnet.org/ipfs/';

const IMAGES_DIR = path.join(__dirname, '..', '..', 'tmoto-assets', 'images');
const METADATA_DIR = path.join(__dirname, '..', '..', 'tmoto-assets', 'metadata');

function uploadFile(filePath) {
    const result = execSync(
        `curl -s -F "file=@${filePath.replace(/\\/g, '/')}" "${IPFS_ENDPOINT}?pin=true"`,
        { encoding: 'utf-8', timeout: 60000 },
    );
    return JSON.parse(result.trim());
}

function uploadDirectory(dirPath, label) {
    const files = fs.readdirSync(dirPath).sort();
    console.log(`  Uploading ${files.length} files from ${label}...`);

    // Build curl command with all files for wrap-with-directory
    const args = files.map(f => {
        const fp = path.join(dirPath, f).replace(/\\/g, '/');
        return `-F "file=@${fp};filename=${f}"`;
    });

    const cmd = `curl -s ${args.join(' ')} "${IPFS_ENDPOINT}?wrap-with-directory=true&pin=true"`;
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 120000, maxBuffer: 10 * 1024 * 1024 });

    // NDJSON response: one entry per file + final entry for directory root
    const lines = result.trim().split('\n').map(l => JSON.parse(l));
    const rootEntry = lines.find(l => l.Name === '') || lines[lines.length - 1];

    for (const entry of lines) {
        if (entry.Name) {
            console.log(`    ${entry.Name} -> ${entry.Hash}`);
        }
    }

    console.log(`  Root CID: ${rootEntry.Hash}`);
    return rootEntry.Hash;
}

async function main() {
    console.log('TMOTO IPFS Upload (OPNet IPFS)');
    console.log('==============================\n');

    // 1. Upload images directory
    console.log('[1/3] Uploading images...');
    const imagesCID = uploadDirectory(IMAGES_DIR, 'images');
    console.log(`  Gateway: ${IPFS_GATEWAY}${imagesCID}/`);
    console.log('');

    // 2. Update metadata with real images CID
    console.log('[2/3] Updating metadata with images CID...');
    const metaFiles = fs.readdirSync(METADATA_DIR).filter(f => f.endsWith('.json'));
    let updated = 0;
    for (const file of metaFiles) {
        const filePath = path.join(METADATA_DIR, file);
        let content = fs.readFileSync(filePath, 'utf-8');
        if (content.includes('IMAGES_CID_PLACEHOLDER')) {
            content = content.replace(/IMAGES_CID_PLACEHOLDER/g, `ipfs://${imagesCID}`);
            fs.writeFileSync(filePath, content);
            updated++;
        }
    }
    console.log(`  Updated ${updated} metadata files`);
    console.log('');

    // 3. Upload metadata directory
    console.log('[3/3] Uploading metadata...');
    const metadataCID = uploadDirectory(METADATA_DIR, 'metadata');
    console.log(`  Gateway: ${IPFS_GATEWAY}${metadataCID}/`);
    console.log('');

    // Output
    console.log('========================================');
    console.log('  TMOTO IPFS Upload Complete!');
    console.log('========================================');
    console.log(`  Images CID:   ${imagesCID}`);
    console.log(`  Metadata CID: ${metadataCID}`);
    console.log('');
    console.log(`  hiddenURI for Create Collection:`);
    console.log(`  ipfs://${metadataCID}/`);
    console.log('');
    console.log(`  Verify:`);
    console.log(`  ${IPFS_GATEWAY}${metadataCID}/1.json`);
    console.log(`  ${IPFS_GATEWAY}${imagesCID}/01-og.png`);
    console.log('========================================');
}

main().catch(err => {
    console.error('Upload failed:', err.message);
    process.exit(1);
});
