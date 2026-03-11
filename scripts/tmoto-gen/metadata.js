/**
 * TMOTO NFT Collection — Generate ERC-721-style metadata JSONs
 *
 * These will be uploaded alongside the images to IPFS.
 * The collection hiddenURI will point to ipfs://<CID>/
 * and each token fetches metadata at ipfs://<CID>/<tokenId>.json
 */

const path = require('path');
const fs = require('fs');

const META_DIR = path.join(__dirname, '..', '..', 'tmoto-assets', 'metadata');

const variations = [
    { name: 'OG',        rarity: 'Common',    element: 'Neutral',  mood: 'Chill' },
    { name: 'Fire',      rarity: 'Rare',      element: 'Fire',     mood: 'Fierce' },
    { name: 'Ice',       rarity: 'Rare',      element: 'Ice',      mood: 'Cool' },
    { name: 'Toxic',     rarity: 'Uncommon',  element: 'Poison',   mood: 'Mischievous' },
    { name: 'Royal',     rarity: 'Epic',      element: 'Arcane',   mood: 'Regal' },
    { name: 'Gold',      rarity: 'Legendary', element: 'Light',    mood: 'Majestic' },
    { name: 'Shadow',    rarity: 'Epic',      element: 'Dark',     mood: 'Mysterious' },
    { name: 'Bubblegum', rarity: 'Common',    element: 'Candy',    mood: 'Playful' },
    { name: 'Ocean',     rarity: 'Uncommon',  element: 'Water',    mood: 'Calm' },
    { name: 'Sunset',    rarity: 'Uncommon',  element: 'Fire',     mood: 'Warm' },
    { name: 'Cyber',     rarity: 'Rare',      element: 'Tech',     mood: 'Electric' },
    { name: 'Lava',      rarity: 'Rare',      element: 'Fire',     mood: 'Intense' },
    { name: 'Arctic',    rarity: 'Uncommon',  element: 'Ice',      mood: 'Serene' },
    { name: 'Jungle',    rarity: 'Common',    element: 'Nature',   mood: 'Wild' },
    { name: 'Midnight',  rarity: 'Epic',      element: 'Dark',     mood: 'Enigmatic' },
    { name: 'Plasma',    rarity: 'Legendary', element: 'Energy',   mood: 'Unstable' },
    { name: 'Rust',      rarity: 'Common',    element: 'Earth',    mood: 'Rugged' },
    { name: 'Crystal',   rarity: 'Rare',      element: 'Light',    mood: 'Pristine' },
    { name: 'Inferno',   rarity: 'Epic',      element: 'Fire',     mood: 'Blazing' },
    { name: 'Void',      rarity: 'Legendary', element: 'Void',     mood: 'Abyssal' },
];

const imageFiles = [
    '01-og.png', '02-fire.png', '03-ice.png', '04-toxic.png', '05-royal.png',
    '06-gold.png', '07-shadow.png', '08-bubblegum.png', '09-ocean.png', '10-sunset.png',
    '11-cyber.png', '12-lava.png', '13-arctic.png', '14-jungle.png', '15-midnight.png',
    '16-plasma.png', '17-rust.png', '18-rust.png', '19-inferno.png', '20-void.png',
];

function generate() {
    fs.mkdirSync(META_DIR, { recursive: true });

    for (let i = 0; i < variations.length; i++) {
        const v = variations[i];
        const tokenId = i + 1;
        const idx = String(tokenId).padStart(2, '0');

        // Metadata follows ERC-721 standard (name, description, image, attributes)
        // The `image` field uses a relative path — will be resolved by the gateway
        // once we know the images CID, we update this
        const metadata = {
            name: `TMOTO #${tokenId} — ${v.name}`,
            description: `MotoCat #${tokenId} (${v.name} edition). A unique Bitcoin NFT from the TMOTO collection on OPNet. Element: ${v.element}. Mood: ${v.mood}.`,
            image: `IMAGES_CID_PLACEHOLDER/${imageFiles[i]}`,
            attributes: [
                { trait_type: 'Edition', value: v.name },
                { trait_type: 'Rarity', value: v.rarity },
                { trait_type: 'Element', value: v.element },
                { trait_type: 'Mood', value: v.mood },
                { trait_type: 'Token ID', value: tokenId },
            ],
        };

        const filename = `${tokenId}.json`;
        fs.writeFileSync(
            path.join(META_DIR, filename),
            JSON.stringify(metadata, null, 2) + '\n',
        );
        console.log(`  [${idx}/20] ${filename} — ${v.name}`);
    }

    // Also create a collection-level metadata file
    const collectionMeta = {
        name: 'TMOTO',
        description: 'MotoCat collection — 20 unique Bitcoin NFTs on OPNet. Each MotoCat has a distinct element and mood.',
        image: 'IMAGES_CID_PLACEHOLDER/01-og.png',
        external_url: 'https://forge.opnet.org',
        seller_fee_basis_points: 500,
        fee_recipient: 'opt1pee9mrlhfxkmfqdssjsr8gwedewn2mgk08rrqla29rg0fjry29ths0cjdrz',
    };
    fs.writeFileSync(
        path.join(META_DIR, 'collection.json'),
        JSON.stringify(collectionMeta, null, 2) + '\n',
    );
    console.log('\n  collection.json created');

    console.log(`\nDone! Metadata saved to ${META_DIR}`);
    console.log('\nNext: Upload images to IPFS, get CID, then update IMAGES_CID_PLACEHOLDER in metadata files, then upload metadata to IPFS.');
}

generate();
