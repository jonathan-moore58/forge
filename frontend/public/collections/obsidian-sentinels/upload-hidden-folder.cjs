#!/usr/bin/env node
/**
 * Upload a folder of identical "hidden/unrevealed" metadata JSONs to IPFS.
 *
 * WHY?
 * OP721's tokenURI() always returns: baseURI + tokenId.toString()
 * So we need a folder where files "1", "2", ..., "50" all exist and each
 * returns the same hidden placeholder metadata.
 *
 * This folder CID is then used as the hiddenURI at deploy time:
 *   hiddenURI = "ipfs://QmHiddenFolderCID/"
 *   tokenURI(1) → "ipfs://QmHiddenFolderCID/1" → hidden placeholder JSON
 *
 * Usage:
 *   node upload-hidden-folder.cjs
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const IPFS_ENDPOINT = 'https://ipfs.opnet.org/api/v0/add';

// Collection config
const COLLECTION_NAME = 'Obsidian Sentinels';
const MAX_SUPPLY = 50;
const HIDDEN_IMAGE_CID = 'QmWFevwmW2A7u2j5sBeS4DDiXKLe3eWmbaFHBCG5jasTkK';

// The hidden metadata JSON — same for all tokens
const hiddenMetadata = JSON.stringify({
    name: `Unrevealed ${COLLECTION_NAME}`,
    description: 'This sentinel has not yet been revealed. Stay tuned!',
    image: `ipfs://${HIDDEN_IMAGE_CID}`,
    attributes: [],
});

function main() {
    console.log('=== Upload Hidden Metadata Folder to IPFS ===\n');
    console.log(`Creating ${MAX_SUPPLY} identical hidden metadata files...\n`);
    console.log('Hidden metadata:');
    console.log(JSON.stringify(JSON.parse(hiddenMetadata), null, 2));
    console.log('');

    // Create temp directory with files named "1", "2", ..., "50"
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-'));
    for (let i = 1; i <= MAX_SUPPLY; i++) {
        fs.writeFileSync(path.join(tmpDir, String(i)), hiddenMetadata);
    }
    console.log(`Created ${MAX_SUPPLY} temp files in ${tmpDir}\n`);

    // Build curl command: one -F per file + wrap-with-directory=true
    const curlArgs = [];
    for (let i = 1; i <= MAX_SUPPLY; i++) {
        const filePath = path.join(tmpDir, String(i)).replace(/\\/g, '/');
        curlArgs.push(`-F "file=@${filePath};filename=${i}"`);
    }

    const cmd = `curl -s ${curlArgs.join(' ')} "${IPFS_ENDPOINT}?pin=true&wrap-with-directory=true"`;

    console.log(`Uploading ${MAX_SUPPLY} files as IPFS directory via curl...\n`);

    try {
        const stdout = execSync(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 120000 }).toString();

        // IPFS returns ndjson — one line per file + one for the directory
        const results = stdout.trim().split('\n').map(line => JSON.parse(line));
        const dirEntry = results.find(r => r.Name === '');

        if (!dirEntry) {
            console.error('ERROR: No directory CID found in response');
            console.log('Response:', JSON.stringify(results, null, 2));
            process.exit(1);
        }

        const folderCID = dirEntry.Hash;

        console.log('=== UPLOAD COMPLETE ===\n');
        console.log(`Hidden Folder CID: ${folderCID}`);
        console.log(`IPFS URI:          ipfs://${folderCID}/`);
        console.log(`Gateway:           https://ipfs.opnet.org/ipfs/${folderCID}/\n`);

        console.log('Verification:');
        console.log(`  tokenURI(1)  → ipfs://${folderCID}/1  → hidden placeholder`);
        console.log(`  tokenURI(50) → ipfs://${folderCID}/50 → hidden placeholder`);
        console.log(`\n  Gateway: https://ipfs.opnet.org/ipfs/${folderCID}/1`);

        // Save
        const outputPath = path.join(__dirname, 'ipfs-hidden-folder-cid.json');
        fs.writeFileSync(outputPath, JSON.stringify({
            folderCID,
            ipfsURI: `ipfs://${folderCID}/`,
            gateway: `https://ipfs.opnet.org/ipfs/${folderCID}/`,
            purpose: 'Hidden/unrevealed metadata folder for deploy',
            maxSupply: MAX_SUPPLY,
        }, null, 2));
        console.log(`\nSaved to: ${outputPath}`);

        console.log('\n=== USE THIS AS Base URI AT DEPLOY TIME ===');
        console.log(`Base URI = "ipfs://${folderCID}/"`);

    } catch (err) {
        console.error('Upload failed:', err.message);
        process.exit(1);
    } finally {
        // Cleanup temp files
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

main();
