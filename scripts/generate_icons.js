import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const SOURCE_IMAGE = 'C:/Users/Win/.gemini/antigravity-ide/brain/2e591378-2267-4f60-a907-f24adcea776a/.user_uploaded/media_1791716551131.jpg';
const PUBLIC_DIR = path.resolve('public');

async function buildIcons() {
  console.log('Loading source image:', SOURCE_IMAGE);
  const srcBuffer = fs.readFileSync(SOURCE_IMAGE);

  // 1. High-Resolution Clean Master Logo PNG
  await sharp(srcBuffer)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(PUBLIC_DIR, 'logo.png'));
  console.log('Generated public/logo.png');

  // 2. High-Res 512x512 Standard Icon
  await sharp(srcBuffer)
    .resize(512, 512, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(PUBLIC_DIR, 'icon-512.png'));
  console.log('Generated public/icon-512.png');

  // 3. High-Res 192x192 Standard Icon
  await sharp(srcBuffer)
    .resize(192, 192, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(PUBLIC_DIR, 'icon-192.png'));
  console.log('Generated public/icon-192.png');

  // 4. Android Maskable Icons (With 15% Safe-Zone Padding so Android doesn't crop or stretch)
  // Outer canvas 512x512 with exact logo background color #f6f3ee (246, 243, 238), inner logo scaled to 410x410 centered
  const inner512 = await sharp(srcBuffer)
    .resize(410, 410, { kernel: sharp.kernel.lanczos3, fit: 'contain', background: { r: 246, g: 243, b: 238, alpha: 1 } })
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 246, g: 243, b: 238, alpha: 1 }
    }
  })
    .composite([{ input: inner512, gravity: 'center' }])
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(PUBLIC_DIR, 'icon-maskable-512.png'));
  console.log('Generated public/icon-maskable-512.png');

  // 192x192 Maskable
  const inner192 = await sharp(srcBuffer)
    .resize(154, 154, { kernel: sharp.kernel.lanczos3, fit: 'contain', background: { r: 246, g: 243, b: 238, alpha: 1 } })
    .toBuffer();

  await sharp({
    create: {
      width: 192,
      height: 192,
      channels: 4,
      background: { r: 246, g: 243, b: 238, alpha: 1 }
    }
  })
    .composite([{ input: inner192, gravity: 'center' }])
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(PUBLIC_DIR, 'icon-maskable-192.png'));
  console.log('Generated public/icon-maskable-192.png');

  // 5. Apple Touch Icon for iOS Safari (180x180)
  await sharp(srcBuffer)
    .resize(180, 180, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(PUBLIC_DIR, 'apple-touch-icon.png'));
  console.log('Generated public/apple-touch-icon.png');

  // 6. Favicon 32x32 & 64x64
  await sharp(srcBuffer)
    .resize(64, 64, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 100 })
    .toFile(path.join(PUBLIC_DIR, 'favicon-64.png'));

  await sharp(srcBuffer)
    .resize(32, 32, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 100 })
    .toFile(path.join(PUBLIC_DIR, 'favicon-32.png'));
  console.log('Generated public favicons');

  // 7. Generate Base64 for PDF Generator (src/logoBase64.js)
  // 400x400 PNG is ideal for crisp PDF reproduction without bloating PDF size
  const pdfLogoBuffer = await sharp(srcBuffer)
    .resize(400, 400, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 95 })
    .toBuffer();

  const base64Data = `data:image/png;base64,${pdfLogoBuffer.toString('base64')}`;
  const base64FileContent = `// Auto-generated crisp high-resolution logo for Mahajan Facilities Reports
export const MAHAJAN_LOGO_BASE64 = '${base64Data}';
`;
  fs.writeFileSync(path.resolve('src/logoBase64.js'), base64FileContent, 'utf-8');
  console.log('Updated src/logoBase64.js with new high-res logo base64!');

  console.log('ALL ICONS SUCCESSFULLY CREATED & OPTIMIZED!');
}

buildIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
