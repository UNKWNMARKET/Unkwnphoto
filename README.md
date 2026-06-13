# Unkwnphoto

An immersive photography portfolio for **Unkwnphoto**.

- The site opens on a black screen where the name **Unkwnphoto** fades in with a
  **click to enter** prompt.
- Entering reveals an animated deep-space scene — drifting planets, twinkling
  stars, and the occasional shooting star — kept subtle and clean.
- Your photos appear in a glass gallery over the scene. Each card shows a title
  and description; clicking a photo opens a full-screen viewer with arrow-key
  and on-screen navigation.
- Photos are managed through a small **back end**: upload images with a title and
  description from the **Manage photos** panel, and they are stored on the server
  and served to the gallery.

## Tech stack

- **Front end:** React + TypeScript, built with Vite. The space scene is a
  single HTML canvas animation.
- **Back end:** Express + TypeScript with `multer` for uploads. Image files are
  saved to `uploads/` and their metadata to `data/photos.json`.

## Getting started

```bash
npm install
npm run dev
```

`npm run dev` starts both servers at once:

- Front end: <http://localhost:5173> (open this one)
- API: <http://localhost:3001>

The Vite dev server proxies `/api` and `/uploads` to the Express server, so the
app works from a single URL during development.

## Uploading photos

1. Open <http://localhost:5173>, click to enter, then click **Manage photos**.
2. Choose an image, add a title and description, and click **Upload photo**.
3. The gallery updates immediately. Use the **Delete** buttons to remove photos.

Three sample placeholder images ship in `public/samples/` so the gallery looks
alive on first run — delete them once you add your own.

## Production build

```bash
npm run build   # compiles the server and bundles the client into dist/
npm start       # serves the API and the built site from http://localhost:3001
```

When `dist/` exists, the Express server also serves the front end, so a single
process runs the whole site.

## Deploying (public URL)

This repo includes `render.yaml`, a one-click blueprint for [Render](https://render.com).

1. Push this repo to GitHub (already done if you got here from a GitHub link).
2. On Render, choose **New → Blueprint** and select this repository.
3. Render reads `render.yaml`, runs `npm install && npm run build`, then
   `npm start`, and gives you a public URL like `https://unkwnphoto.onrender.com`.

The single Express process serves both the API and the built site, so no extra
configuration is needed.

**Note on uploads:** on Render's free plan the filesystem is ephemeral, so photos
uploaded through **Manage photos** are cleared whenever the service restarts or
redeploys. For permanent storage, attach a Render persistent disk (paid) or move
uploads to object storage (S3 / Cloudinary) — ask and this can be wired up.

## Project layout

```
server/index.ts        Express API: list, upload, delete photos
src/                    React front end
  components/
    Intro.tsx           Black screen + "click to enter"
    SpaceScene.tsx      Canvas: planets, stars, shooting stars
    Gallery.tsx         Photo grid
    Lightbox.tsx        Full-screen photo viewer
    Manage.tsx          Upload / delete panel
data/photos.json        Photo metadata (created at runtime)
uploads/                Uploaded image files (created at runtime)
public/samples/         Placeholder images
```
