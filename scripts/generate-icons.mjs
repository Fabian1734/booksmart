import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const sourcePath = join(publicDir, 'logo-source.png');

const source = readFileSync(sourcePath);

const sizes = [
  { name: 'logo512.png', size: 512 },
  { name: 'logo192.png', size: 192 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'favicon-32.png', size: 32 },
];

for (const { name, size } of sizes) {
  await sharp(source)
    .resize(size, size, { fit: 'cover' })
    .png()
    .toFile(join(publicDir, name));
  console.log(`wrote ${name} (${size}x${size})`);
}

const png16 = await sharp(source).resize(16, 16, { fit: 'cover' }).png().toBuffer();
const png32 = await sharp(source).resize(32, 32, { fit: 'cover' }).png().toBuffer();

function buildIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  let offset = 6 + count * 16;
  const entries = [];
  const dataChunks = [];

  for (const { buf, size } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    dataChunks.push(buf);
    offset += buf.length;
  }

  return Buffer.concat([header, ...entries, ...dataChunks]);
}

const ico = buildIco([
  { buf: png16, size: 16 },
  { buf: png32, size: 32 },
]);
writeFileSync(join(publicDir, 'favicon.ico'), ico);
console.log('wrote favicon.ico');
