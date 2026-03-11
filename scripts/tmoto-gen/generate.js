/**
 * TMOTO NFT Collection — Generate 20 variations from motocat.avif
 *
 * Creates unique color/background/overlay combos for each token.
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const INPUT = 'C:/Users/jamal/Downloads/motocat.avif';
const OUT_DIR = path.join(__dirname, '..', '..', 'tmoto-assets', 'images');

// 20 unique variation configs
const variations = [
    { name: 'OG',            bg: [30, 30, 30],     tint: null,              modulate: null },
    { name: 'Fire',          bg: [180, 40, 20],    tint: { r: 255, g: 80, b: 0 },   modulate: { brightness: 1.05, saturation: 1.4 } },
    { name: 'Ice',           bg: [20, 60, 140],    tint: { r: 100, g: 180, b: 255 }, modulate: { brightness: 1.1, saturation: 0.8 } },
    { name: 'Toxic',         bg: [10, 80, 10],     tint: { r: 50, g: 255, b: 50 },   modulate: { brightness: 1.0, saturation: 1.5 } },
    { name: 'Royal',         bg: [60, 10, 120],    tint: { r: 180, g: 50, b: 255 },  modulate: { brightness: 1.0, saturation: 1.2 } },
    { name: 'Gold',          bg: [120, 100, 20],   tint: { r: 255, g: 215, b: 0 },   modulate: { brightness: 1.15, saturation: 1.3 } },
    { name: 'Shadow',        bg: [10, 10, 10],     tint: null,              modulate: { brightness: 0.6, saturation: 0.3 } },
    { name: 'Bubblegum',     bg: [220, 80, 160],   tint: { r: 255, g: 100, b: 200 }, modulate: { brightness: 1.1, saturation: 1.6 } },
    { name: 'Ocean',         bg: [0, 50, 80],      tint: { r: 0, g: 150, b: 200 },   modulate: { brightness: 1.0, saturation: 1.1 } },
    { name: 'Sunset',        bg: [200, 80, 40],    tint: { r: 255, g: 140, b: 50 },  modulate: { brightness: 1.1, saturation: 1.4 } },
    { name: 'Cyber',         bg: [0, 255, 200],    tint: { r: 0, g: 255, b: 200 },   modulate: { brightness: 1.2, saturation: 1.8 } },
    { name: 'Lava',          bg: [100, 20, 0],     tint: { r: 255, g: 50, b: 0 },    modulate: { brightness: 0.9, saturation: 1.6 } },
    { name: 'Arctic',        bg: [200, 220, 240],  tint: { r: 200, g: 230, b: 255 }, modulate: { brightness: 1.2, saturation: 0.5 } },
    { name: 'Jungle',        bg: [20, 60, 20],     tint: { r: 80, g: 200, b: 50 },   modulate: { brightness: 0.95, saturation: 1.3 } },
    { name: 'Midnight',      bg: [15, 10, 40],     tint: { r: 60, g: 40, b: 150 },   modulate: { brightness: 0.7, saturation: 0.9 } },
    { name: 'Plasma',        bg: [80, 0, 120],     tint: { r: 200, g: 0, b: 255 },   modulate: { brightness: 1.1, saturation: 2.0 } },
    { name: 'Rust',          bg: [100, 50, 20],    tint: { r: 180, g: 100, b: 40 },  modulate: { brightness: 0.9, saturation: 1.2 } },
    { name: 'Crystal',       bg: [180, 220, 255],  tint: { r: 180, g: 220, b: 255 }, modulate: { brightness: 1.3, saturation: 0.6 } },
    { name: 'Inferno',       bg: [150, 30, 0],     tint: { r: 255, g: 100, b: 0 },   modulate: { brightness: 1.0, saturation: 2.0 } },
    { name: 'Void',          bg: [5, 5, 15],       tint: { r: 30, g: 20, b: 60 },    modulate: { brightness: 0.5, saturation: 0.4 } },
];

async function generate() {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    // Load and resize base to 512x512 PNG (convert from AVIF)
    const base = await sharp(INPUT)
        .resize(512, 512, { fit: 'cover' })
        .png()
        .toBuffer();

    // Get the image metadata to know alpha support
    const baseMeta = await sharp(base).metadata();
    console.log(`Base image: ${baseMeta.width}x${baseMeta.height}, ${baseMeta.channels} channels`);

    for (let i = 0; i < variations.length; i++) {
        const v = variations[i];
        const idx = String(i + 1).padStart(2, '0');
        const filename = `${idx}-${v.name.toLowerCase()}.png`;

        // Create background layer
        const bgLayer = await sharp({
            create: {
                width: 512,
                height: 512,
                channels: 3,
                background: { r: v.bg[0], g: v.bg[1], b: v.bg[2] },
            },
        }).png().toBuffer();

        // Apply tint + modulation to the cat image
        let catProcessed = sharp(base);
        if (v.tint) {
            catProcessed = catProcessed.tint(v.tint);
        }
        if (v.modulate) {
            catProcessed = catProcessed.modulate(v.modulate);
        }
        const catBuf = await catProcessed.png().toBuffer();

        // Composite cat over background
        const result = await sharp(bgLayer)
            .composite([{ input: catBuf, blend: 'over' }])
            .png({ quality: 90 })
            .toFile(path.join(OUT_DIR, filename));

        console.log(`  [${idx}/20] ${v.name} -> ${filename} (${result.size} bytes)`);
    }

    console.log(`\nDone! ${variations.length} images saved to ${OUT_DIR}`);
}

generate().catch(err => {
    console.error('Generation failed:', err);
    process.exit(1);
});
