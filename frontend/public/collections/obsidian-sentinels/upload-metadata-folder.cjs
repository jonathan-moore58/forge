#!/usr/bin/env node
/**
 * Upload all 50 NFT metadata JSONs to IPFS as a FOLDER (directory).
 *
 * WHY A FOLDER?
 * OP721's tokenURI() returns: baseURI + tokenId.toString()
 * So baseURI = "ipfs://QmFolderCID/" → tokenURI(1) = "ipfs://QmFolderCID/1"
 * The files inside the folder must be named 1, 2, 3 ... (NO .json extension)
 * because the contract appends just the number, not "1.json".
 *
 * Usage:
 *   node upload-metadata-folder.cjs
 *
 * Prerequisites:
 *   - Run upload-nfts.cjs first (to get SVG CIDs)
 *   - Run upload-metadata.cjs first (to update image fields in JSONs)
 *   - Or just ensure nfts/*.json have correct ipfs:// image URIs
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const IPFS_ENDPOINT = 'https://ipfs.opnet.org/api/v0/add';
const NFT_DIR = path.join(__dirname, 'nfts');
const CID_MAP_PATH = path.join(__dirname, 'ipfs-cids.json');

function main() {
    console.log('=== IPFS Folder Upload for OP721 tokenURI() ===\n');

    // Ensure SVG CIDs exist (metadata JSONs need ipfs:// image URIs)
    if (!fs.existsSync(CID_MAP_PATH)) {
        console.error('ERROR: ipfs-cids.json not found. Run upload-nfts.cjs first.');
        process.exit(1);
    }
    const svgCids = JSON.parse(fs.readFileSync(CID_MAP_PATH, 'utf8'));

    // Collect metadata files
    const jsonFiles = fs.readdirSync(NFT_DIR)
        .filter(f => f.endsWith('.json'))
        .sort((a, b) => parseInt(a) - parseInt(b));

    console.log(`Found ${jsonFiles.length} metadata files\n`);

    // Create temp directory with files named "1", "2", ..., "50" (no extension)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-'));

    for (const file of jsonFiles) {
        const filePath = path.join(NFT_DIR, file);
        const metadata = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Ensure image field uses IPFS URI
        const svgFile = file.replace('.json', '.svg');
        if (svgCids[svgFile] && !metadata.image.startsWith('ipfs://')) {
            metadata.image = `ipfs://${svgCids[svgFile]}`;
            fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2));
        }

        // File name = just the number (e.g. "1", "2", ...)
        const tokenId = file.replace('.json', '');
        fs.writeFileSync(path.join(tmpDir, tokenId), JSON.stringify(metadata));
    }

    console.log(`Prepared ${jsonFiles.length} files in temp dir (named 1-${jsonFiles.length}, no extension)\n`);

    // Build curl command: one -F per file + wrap-with-directory=true
    const curlArgs = [];
    for (const file of jsonFiles) {
        const tokenId = file.replace('.json', '');
        const tmpPath = path.join(tmpDir, tokenId).replace(/\\/g, '/');
        curlArgs.push(`-F "file=@${tmpPath};filename=${tokenId}"`);
    }

    const cmd = `curl -s ${curlArgs.join(' ')} "${IPFS_ENDPOINT}?pin=true&wrap-with-directory=true"`;

    console.log(`Uploading ${jsonFiles.length} files as IPFS directory via curl...\n`);

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
        console.log(`Metadata Folder CID: ${folderCID}`);
        console.log(`IPFS URI:            ipfs://${folderCID}/`);
        console.log(`Gateway:             https://ipfs.opnet.org/ipfs/${folderCID}/\n`);

        // Verify a few files
        console.log('Verification (these should resolve):');
        console.log(`  tokenURI(1)  → ipfs://${folderCID}/1`);
        console.log(`  tokenURI(25) → ipfs://${folderCID}/25`);
        console.log(`  tokenURI(50) → ipfs://${folderCID}/50`);
        console.log(`\n  Gateway check: https://ipfs.opnet.org/ipfs/${folderCID}/1`);

        // Save the folder CID
        const outputPath = path.join(__dirname, 'ipfs-folder-cid.json');
        const output = {
            folderCID,
            ipfsURI: `ipfs://${folderCID}/`,
            gateway: `https://ipfs.opnet.org/ipfs/${folderCID}/`,
            fileCount: jsonFiles.length,
            files: results.filter(r => r.Name !== '').map(r => ({
                name: r.Name,
                cid: r.Hash,
                size: r.Size,
            })),
        };
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
        console.log(`\nFolder CID saved to: ${outputPath}`);

        console.log('\n=== NEXT STEPS ===');
        console.log(`1. Deploy collection with Base URI = hidden folder CID`);
        console.log(`2. After minting, reveal by calling setBaseURI("ipfs://${folderCID}/")`);
        console.log(`3. tokenURI(N) will then resolve to ipfs://${folderCID}/N`);

    } catch (err) {
        console.error('Upload failed:', err.message);
        process.exit(1);
    } finally {
        // Cleanup temp files
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

main();
