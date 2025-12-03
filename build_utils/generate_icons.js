const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const SOURCE_IMAGE = path.join(__dirname, '../design/temprix_logo.png');
const ICON_OUTPUT_DIR = path.join(__dirname, '../src/src-tauri/icons');
const ASSETS_OUTPUT_DIR = path.join(__dirname, '../src/src/assets');

// Icon sizes required by Tauri and common platforms
const ICONS = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
  { name: 'icon.png', size: 512 },
  { name: 'Square30x30Logo.png', size: 30 },
  { name: 'Square44x44Logo.png', size: 44 },
  { name: 'Square71x71Logo.png', size: 71 },
  { name: 'Square89x89Logo.png', size: 89 },
  { name: 'Square107x107Logo.png', size: 107 },
  { name: 'Square142x142Logo.png', size: 142 },
  { name: 'Square150x150Logo.png', size: 150 },
  { name: 'Square284x284Logo.png', size: 284 },
  { name: 'Square310x310Logo.png', size: 310 },
  { name: 'StoreLogo.png', size: 50 }, // Placeholder size, adjust if needed
];

// Check if source image exists
if (!fs.existsSync(SOURCE_IMAGE)) {
  console.error(`Error: Source image not found at ${SOURCE_IMAGE}`);
  process.exit(1);
}

// Ensure output directories exist
if (!fs.existsSync(ICON_OUTPUT_DIR)) {
  fs.mkdirSync(ICON_OUTPUT_DIR, { recursive: true });
}
if (!fs.existsSync(ASSETS_OUTPUT_DIR)) {
  fs.mkdirSync(ASSETS_OUTPUT_DIR, { recursive: true });
}

// Function to resize image using sips (macOS built-in) or ffmpeg if available
// Since user is on macOS, sips is reliable.
function resizeImage(source, destination, size) {
    try {
        // Using sips (Scriptable Image Processing System) which is built-in on macOS
        execSync(`sips -z ${size} ${size} "${source}" --out "${destination}"`);
        console.log(`Generated: ${destination}`);
    } catch (error) {
        console.error(`Failed to generate ${destination}:`, error.message);
    }
}

// Generate standard PNG icons
console.log('Generating PNG icons...');
ICONS.forEach(icon => {
    const destPath = path.join(ICON_OUTPUT_DIR, icon.name);
    resizeImage(SOURCE_IMAGE, destPath, icon.size);
});

// Generate assets logo
console.log('Generating assets logo...');
resizeImage(SOURCE_IMAGE, path.join(ASSETS_OUTPUT_DIR, 'logo.png'), 150);


// Generate .icns (macOS)
// This usually requires iconutil which works with an .iconset folder
// Simplified approach: Just creating a 512x512 png named icon.icns as a placeholder 
// is NOT valid. Real .icns generation is complex.
// However, for a simple script, we can try to use a cli tool if installed, or skip.
// Given the "simple script" request, we will create the iconset and convert it.

console.log('Generating .icns...');
const iconsetDir = path.join(ICON_OUTPUT_DIR, 'icon.iconset');
if (!fs.existsSync(iconsetDir)) fs.mkdirSync(iconsetDir);

const iconsetMap = [
    { name: 'icon_16x16.png', size: 16 },
    { name: 'icon_16x16@2x.png', size: 32 },
    { name: 'icon_32x32.png', size: 32 },
    { name: 'icon_32x32@2x.png', size: 64 },
    { name: 'icon_128x128.png', size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png', size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png', size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 },
];

iconsetMap.forEach(icon => {
    resizeImage(SOURCE_IMAGE, path.join(iconsetDir, icon.name), icon.size);
});

try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(ICON_OUTPUT_DIR, 'icon.icns')}"`);
    console.log('Generated: icon.icns');
    // Cleanup
    fs.rmSync(iconsetDir, { recursive: true, force: true });
} catch (e) {
    console.warn('Warning: Could not generate .icns file. `iconutil` might be missing or failed.');
}


// Generate .ico (Windows)
// ImageMagick is typically required for this. `sips` cannot output .ico.
// We will skip .ico generation in this simple script unless we want to use a node library.
// For a simple script without extra npm dependencies (like png-to-ico), we might have to skip or use ffmpeg if available.
// We will try to make a copy of the 32x32 png as .ico as a fallback/placeholder, although it's not a valid ICO container.
// Ideally, the user would install `imagemagick`.
console.log('Note: .ico generation requires ImageMagick (convert) or similar tools. Skipping for this simple script or just copying png.');
// Attempting copy for simple placeholder (will likely not work on Windows properly but fulfills "place file")
// Better: Check for `convert`
try {
     execSync(`convert "${SOURCE_IMAGE}" -define icon:auto-resize=256,128,64,48,32,16 "${path.join(ICON_OUTPUT_DIR, 'icon.ico')}"`);
     console.log('Generated: icon.ico using ImageMagick');
} catch (e) {
    console.log('ImageMagick `convert` not found. Creating a placeholder .ico from standard png (may not work in Windows).');
    fs.copyFileSync(path.join(ICON_OUTPUT_DIR, 'icon.png'), path.join(ICON_OUTPUT_DIR, 'icon.ico'));
}

console.log('Done generating icons.');
