import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const DATA_FILE = path.join(ROOT, "data", "photos.json");
const UPLOADS_DIR = path.join(ROOT, "uploads");
const CLIENT_DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT) || 3001;

for (const dir of [path.dirname(DATA_FILE), UPLOADS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, "[]\n");
}

interface Photo {
  id: string;
  title: string;
  description: string;
  url: string;
  createdAt: string;
}

function readPhotos(): Photo[] {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8").trim();
    return raw ? (JSON.parse(raw) as Photo[]) : [];
  } catch {
    return [];
  }
}

function writePhotos(photos: Photo[]): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(photos, null, 2) + "\n");
}

const ALLOWED = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ALLOWED.has(ext));
  }
});

const app = express();
app.use(cors());
app.use(express.json());

// Serve uploaded originals.
app.use("/uploads", express.static(UPLOADS_DIR, { maxAge: "365d" }));

// List every photo, newest first.
app.get("/api/photos", (_req, res) => {
  const photos = readPhotos().sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
  res.json(photos);
});

// Upload a new photo with a title + description.
app.post("/api/photos", upload.single("photo"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "An image file is required." });
    return;
  }
  const title = String(req.body.title ?? "").trim() || "Untitled";
  const description = String(req.body.description ?? "").trim();
  const photo: Photo = {
    id: crypto.randomUUID(),
    title,
    description,
    url: `/uploads/${req.file.filename}`,
    createdAt: new Date().toISOString()
  };
  const photos = readPhotos();
  photos.push(photo);
  writePhotos(photos);
  res.status(201).json(photo);
});

// Delete a photo (and its file when it lives in /uploads).
app.delete("/api/photos/:id", (req, res) => {
  const photos = readPhotos();
  const photo = photos.find((p) => p.id === req.params.id);
  if (!photo) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  if (photo.url.startsWith("/uploads/")) {
    const filePath = path.join(UPLOADS_DIR, path.basename(photo.url));
    fs.rm(filePath, { force: true }, () => {});
  }
  writePhotos(photos.filter((p) => p.id !== photo.id));
  res.status(204).end();
});

// In production serve the built front end from dist/.
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Unkwnphoto API running at http://localhost:${PORT}`);
});
