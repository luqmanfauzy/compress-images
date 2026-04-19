import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import cors from 'cors';
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';

// ===== INIT =====
const app = express();
app.use(cors());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// ===== CONFIG =====
const PORT = 3000;

// ===== MULTER =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + file.originalname;
    cb(null, unique);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ===== COMPRESS =====
async function compressImage(inputPath, outputPath) {
  await sharp(inputPath)
    .resize({ width: 1024 })
    .webp({ quality: 70 })
    .toFile(outputPath);
}

// ===== ROUTE =====
app.post('/compress', upload.array('images', 100), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const limit = pLimit(5); // 🔥 batasi 5 file paralel

    const outputFiles = await Promise.all(
      files.map(file => 
        limit(async () => {
          const outputPath = `output/compressed-${file.filename}.webp`;
          await compressImage(file.path, outputPath);
          return outputPath;
        })
      )
    );

    // ===== ZIP =====
    const zipPath = `output/result-${Date.now()}.zip`;
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip');

    archive.pipe(output);

    outputFiles.forEach(file => {
      archive.file(file, { name: path.basename(file) });
    });

    await archive.finalize();

    output.on('close', () => {
      res.download(zipPath, 'compressed.zip', () => {
        [...files.map(f => f.path), ...outputFiles, zipPath].forEach(file => {
          fs.unlink(file, err => {
            if (err) console.error('Delete error:', err);
          });
        });
      });
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error processing images' });
  }
});

// ===== RUN =====
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});