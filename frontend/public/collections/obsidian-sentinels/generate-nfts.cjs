#!/usr/bin/env node
/**
 * Obsidian Sentinels — Procedural NFT Art Generator
 *
 * Generates 50 unique SVG sentinel images + JSON metadata.
 * Each sentinel has randomized: body shape, eye style, vein patterns,
 * energy color variation, armor details, and rarity traits.
 *
 * Usage: node generate-nfts.js
 * Output: nfts/1.svg, nfts/1.json, ..., nfts/50.svg, nfts/50.json
 */

const fs = require('fs');
const path = require('path');

const TOTAL = 50;
const OUT_DIR = path.join(__dirname, 'nfts');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Seeded PRNG for reproducibility
function mulberry32(seed) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// Trait definitions
const ELEMENTS = [
    { name: 'Fire',     primary: '#FF6B00', secondary: '#FF9500', glow: '#FF4500', weight: 30 },
    { name: 'Void',     primary: '#8B5CF6', secondary: '#A78BFA', glow: '#7C3AED', weight: 20 },
    { name: 'Frost',    primary: '#06B6D4', secondary: '#67E8F9', glow: '#0891B2', weight: 20 },
    { name: 'Venom',    primary: '#22C55E', secondary: '#86EFAC', glow: '#16A34A', weight: 15 },
    { name: 'Eclipse',  primary: '#F59E0B', secondary: '#FDE68A', glow: '#D97706', weight: 10 },
    { name: 'Phantom',  primary: '#EC4899', secondary: '#F9A8D4', glow: '#DB2777', weight: 5  },
];

const HELM_TYPES = ['Peaked', 'Flat', 'Horned', 'Crown', 'Spiked'];
const BODY_BUILDS = ['Lean', 'Standard', 'Heavy', 'Titan'];
const EYE_SHAPES = ['Slit', 'Diamond', 'Round', 'Angular'];
const VEIN_DENSITY = ['Sparse', 'Standard', 'Dense', 'Overcharged'];
const BACKGROUNDS = [
    { name: 'Obsidian Cavern', bg1: '#080604', bg2: '#120a04' },
    { name: 'Volcanic Rift',  bg1: '#0d0604', bg2: '#1a0802' },
    { name: 'Deep Abyss',     bg1: '#040408', bg2: '#08061a' },
    { name: 'Ash Wastes',     bg1: '#0a0908', bg2: '#161412' },
    { name: 'Frozen Void',    bg1: '#040608', bg2: '#061018' },
];

function weightedPick(rng, items) {
    const totalWeight = items.reduce((s, i) => s + i.weight, 0);
    let r = rng() * totalWeight;
    for (const item of items) {
        r -= item.weight;
        if (r <= 0) return item;
    }
    return items[0];
}

function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
}

function rand(rng, min, max) {
    return min + rng() * (max - min);
}

function randInt(rng, min, max) {
    return Math.floor(rand(rng, min, max + 1));
}

function generateSentinelSVG(id, rng) {
    const element = weightedPick(rng, ELEMENTS);
    const helmType = pick(rng, HELM_TYPES);
    const bodyBuild = pick(rng, BODY_BUILDS);
    const eyeShape = pick(rng, EYE_SHAPES);
    const veinDensity = pick(rng, VEIN_DENSITY);
    const background = pick(rng, BACKGROUNDS);

    // Body dimensions based on build
    const buildScale = { Lean: 0.8, Standard: 1.0, Heavy: 1.15, Titan: 1.3 }[bodyBuild];
    const bodyW = Math.round(60 * buildScale);
    const bodyH = Math.round(220 * buildScale);
    const cx = 256;
    const headY = Math.round(256 - bodyH / 2 - 30);
    const shoulderW = Math.round(bodyW * 0.7);

    // Helm variations
    let helmPath = '';
    const hw = Math.round(bodyW * 0.55);
    switch (helmType) {
        case 'Peaked':
            helmPath = `M${cx} ${headY - 40} L${cx - hw} ${headY} L${cx - hw + 5} ${headY + 30} L${cx + hw - 5} ${headY + 30} L${cx + hw} ${headY}Z`;
            break;
        case 'Flat':
            helmPath = `M${cx - hw} ${headY - 10} L${cx - hw} ${headY + 30} L${cx + hw} ${headY + 30} L${cx + hw} ${headY - 10}Z`;
            break;
        case 'Horned':
            helmPath = `M${cx} ${headY - 30} L${cx - hw} ${headY + 5} L${cx - hw - 15} ${headY - 35} L${cx - hw} ${headY + 30} L${cx + hw} ${headY + 30} L${cx + hw + 15} ${headY - 35} L${cx + hw} ${headY + 5}Z`;
            break;
        case 'Crown':
            helmPath = `M${cx - hw + 5} ${headY - 25} L${cx - hw / 2} ${headY - 10} L${cx} ${headY - 30} L${cx + hw / 2} ${headY - 10} L${cx + hw - 5} ${headY - 25} L${cx + hw} ${headY + 5} L${cx + hw} ${headY + 30} L${cx - hw} ${headY + 30} L${cx - hw} ${headY + 5}Z`;
            break;
        case 'Spiked':
            helmPath = `M${cx} ${headY - 50} L${cx - hw + 10} ${headY - 5} L${cx - hw} ${headY + 30} L${cx + hw} ${headY + 30} L${cx + hw - 10} ${headY - 5}Z`;
            break;
    }

    // Eye positions
    const eyeY = headY + 15;
    const eyeSpacing = Math.round(hw * 0.55);

    // Generate eye shapes
    function makeEye(ex, ey) {
        const s = 8;
        switch (eyeShape) {
            case 'Slit':
                return `<path d="M${ex - s} ${ey} L${ex} ${ey - 3} L${ex + s} ${ey} L${ex} ${ey + 3}Z"/>`;
            case 'Diamond':
                return `<path d="M${ex} ${ey - s} L${ex + s} ${ey} L${ex} ${ey + s} L${ex - s} ${ey}Z"/>`;
            case 'Round':
                return `<circle cx="${ex}" cy="${ey}" r="${s - 1}"/>`;
            case 'Angular':
                return `<path d="M${ex - s} ${ey - 4} L${ex + s} ${ey - 6} L${ex + s - 2} ${ey + 4} L${ex - s + 2} ${ey + 6}Z"/>`;
            default:
                return `<circle cx="${ex}" cy="${ey}" r="${s - 2}"/>`;
        }
    }

    // Generate veins
    const veinCount = { Sparse: 3, Standard: 5, Dense: 8, Overcharged: 12 }[veinDensity];
    let veins = '';
    for (let v = 0; v < veinCount; v++) {
        const startX = cx + randInt(rng, -bodyW, bodyW);
        const startY = headY + randInt(rng, 20, 60);
        const segments = randInt(rng, 2, 4);
        let d = `M${startX} ${startY}`;
        let px = startX, py = startY;
        for (let s = 0; s < segments; s++) {
            px += randInt(rng, -20, 20);
            py += randInt(rng, 30, 60);
            d += ` L${px} ${py}`;
        }
        const opacity = rand(rng, 0.3, 0.8).toFixed(2);
        const width = rand(rng, 1, 2.5).toFixed(1);
        veins += `<path d="${d}" fill="none" stroke="${element.primary}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}"/>\n      `;

        // Branch
        if (rng() > 0.5) {
            const bx = px + randInt(rng, -25, 25);
            const by = py + randInt(rng, 15, 40);
            veins += `<path d="M${px} ${py} L${bx} ${by}" fill="none" stroke="${element.primary}" stroke-width="${(parseFloat(width) * 0.6).toFixed(1)}" stroke-linecap="round" opacity="${(parseFloat(opacity) * 0.7).toFixed(2)}"/>\n      `;
        }
    }

    // Body path
    const topY = headY + 30;
    const botY = topY + bodyH;
    const body = `M${cx - shoulderW} ${topY} L${cx - bodyW} ${topY + 40} L${cx - bodyW + 5} ${botY - 30} L${cx - bodyW / 2} ${botY} L${cx + bodyW / 2} ${botY} L${cx + bodyW + 5 - 10} ${botY - 30} L${cx + bodyW} ${topY + 40} L${cx + shoulderW} ${topY}Z`;

    // Shoulder pads
    const shoulderPadL = `M${cx - shoulderW} ${topY} L${cx - shoulderW - 20} ${topY + 15} L${cx - shoulderW - 15} ${topY + 50} L${cx - shoulderW} ${topY + 50}Z`;
    const shoulderPadR = `M${cx + shoulderW} ${topY} L${cx + shoulderW + 20} ${topY + 15} L${cx + shoulderW + 15} ${topY + 50} L${cx + shoulderW} ${topY + 50}Z`;

    // Chest emblem (rare)
    let emblem = '';
    if (rng() > 0.6) {
        const ey = topY + 80;
        emblem = `<path d="M${cx} ${ey - 15} L${cx + 12} ${ey} L${cx} ${ey + 15} L${cx - 12} ${ey}Z" fill="none" stroke="${element.secondary}" stroke-width="1.5" opacity="0.6"/>`;
    }

    // Particle effects (overcharged)
    let particles = '';
    if (veinDensity === 'Overcharged' || veinDensity === 'Dense') {
        const particleCount = veinDensity === 'Overcharged' ? 15 : 8;
        for (let p = 0; p < particleCount; p++) {
            const px2 = cx + randInt(rng, -bodyW - 30, bodyW + 30);
            const py2 = headY + randInt(rng, -20, bodyH + 40);
            const pr = rand(rng, 1, 3).toFixed(1);
            const po = rand(rng, 0.15, 0.5).toFixed(2);
            particles += `<circle cx="${px2}" cy="${py2}" r="${pr}" fill="${element.primary}" opacity="${po}"/>\n      `;
        }
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bg"><stop offset="0%" stop-color="${background.bg2}"/><stop offset="100%" stop-color="${background.bg1}"/></radialGradient>
    <radialGradient id="aura" cx="50%" cy="40%" r="40%"><stop offset="0%" stop-color="${element.glow}" stop-opacity="0.15"/><stop offset="100%" stop-color="${element.glow}" stop-opacity="0"/></radialGradient>
    <linearGradient id="stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#222"/><stop offset="100%" stop-color="#0a0a0a"/></linearGradient>
    <filter id="glow"><feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="auraF"><feGaussianBlur in="SourceGraphic" stdDeviation="10"/></filter>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <circle cx="${cx}" cy="${headY + 60}" r="150" fill="url(#aura)"/>

  <!-- Body -->
  <path d="${body}" fill="url(#stone)" stroke="#1a1a1a" stroke-width="1"/>

  <!-- Shoulder pads -->
  <path d="${shoulderPadL}" fill="#161616"/>
  <path d="${shoulderPadR}" fill="#161616"/>

  <!-- Helm -->
  <path d="${helmPath}" fill="#181818" stroke="#222" stroke-width="1"/>

  <!-- Eyes -->
  <g fill="${element.primary}" filter="url(#glow)">
    ${makeEye(cx - eyeSpacing, eyeY)}
    ${makeEye(cx + eyeSpacing, eyeY)}
  </g>
  <g fill="${element.secondary}" opacity="0.7">
    ${makeEye(cx - eyeSpacing, eyeY)}
    ${makeEye(cx + eyeSpacing, eyeY)}
  </g>

  <!-- Energy veins -->
  <g filter="url(#glow)">
    <!-- Center spine -->
    <path d="M${cx} ${headY + 30} L${cx - 2} ${headY + 100} L${cx + 1} ${headY + 170} L${cx - 1} ${topY + bodyH - 40}" fill="none" stroke="${element.primary}" stroke-width="2" opacity="0.6"/>
    ${veins}
  </g>

  ${emblem}

  <!-- Particles -->
  ${particles}

  <!-- Ambient glow at feet -->
  <ellipse cx="${cx}" cy="${botY + 5}" rx="${bodyW + 10}" ry="15" fill="${element.glow}" opacity="0.08" filter="url(#auraF)"/>

  <!-- Border ring -->
  <rect x="4" y="4" width="504" height="504" rx="16" fill="none" stroke="${element.primary}" stroke-width="1" opacity="0.1"/>
</svg>`;

    // Metadata
    const rarity = element.weight <= 5 ? 'Legendary' : element.weight <= 10 ? 'Epic' : element.weight <= 15 ? 'Rare' : element.weight <= 20 ? 'Uncommon' : 'Common';

    const metadata = {
        name: `Obsidian Sentinel #${id}`,
        description: `An ancient guardian forged from obsidian and infused with ${element.name} energy. ${helmType} helm, ${bodyBuild} build, ${eyeShape} eyes, ${veinDensity} energy veins. One of 50 sentinels standing watch over the Bitcoin blockchain.`,
        image: `${id}.svg`,
        attributes: [
            { trait_type: 'Element', value: element.name },
            { trait_type: 'Helm', value: helmType },
            { trait_type: 'Build', value: bodyBuild },
            { trait_type: 'Eyes', value: eyeShape },
            { trait_type: 'Vein Density', value: veinDensity },
            { trait_type: 'Background', value: background.name },
            { trait_type: 'Rarity', value: rarity },
        ],
    };

    return { svg, metadata };
}

// Generate all 50
console.log(`Generating ${TOTAL} Obsidian Sentinels...`);
const traitCounts = {};

for (let i = 1; i <= TOTAL; i++) {
    const rng = mulberry32(i * 7919 + 42);
    const { svg, metadata } = generateSentinelSVG(i, rng);

    fs.writeFileSync(path.join(OUT_DIR, `${i}.svg`), svg);
    fs.writeFileSync(path.join(OUT_DIR, `${i}.json`), JSON.stringify(metadata, null, 2));

    // Track trait distribution
    for (const attr of metadata.attributes) {
        const key = `${attr.trait_type}: ${attr.value}`;
        traitCounts[key] = (traitCounts[key] || 0) + 1;
    }

    if (i % 10 === 0) console.log(`  Generated ${i}/${TOTAL}`);
}

console.log(`\nDone! Files in: ${OUT_DIR}`);
console.log('\nTrait distribution:');
const sorted = Object.entries(traitCounts).sort(([a], [b]) => a.localeCompare(b));
for (const [trait, count] of sorted) {
    console.log(`  ${trait}: ${count} (${((count / TOTAL) * 100).toFixed(0)}%)`);
}
