import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const artifactsDirectory = dirname(fileURLToPath(import.meta.url));
const source = join(artifactsDirectory, "wechat-cover.svg");
const output = join(artifactsDirectory, "..", "wechat-cover.png");

await sharp(source, { density: 144 })
  .resize(900, 383, { fit: "fill" })
  .flatten({ background: "#FAFAF7" })
  .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
  .toFile(output);

const metadata = await sharp(output).metadata();
if (metadata.width !== 900 || metadata.height !== 383) {
  throw new Error(`Unexpected cover dimensions: ${metadata.width}x${metadata.height}`);
}

console.log(`${output}: ${metadata.width}x${metadata.height}`);
