import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const logoPath = path.join(__dirname, '..', 'public', 'logo.png');
  const buf = await sharp(logoPath)
    .resize(240, 240, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
  
  const b64 = buf.toString('base64');
  const outPath = path.join(__dirname, '..', 'src', 'logoBase64.js');
  fs.writeFileSync(outPath, `export const MAHAJAN_LOGO_BASE64 = 'data:image/png;base64,${b64}';\n`);
  console.log(`Generated ${outPath} with size: ${b64.length} chars`);
}

run().catch(console.error);
