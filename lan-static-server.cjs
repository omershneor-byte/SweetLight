const http = require("http");
const fs = require("fs");
const path = require("path");

const host = process.env.LAN_STATIC_HOST || "0.0.0.0";
const port = Number(process.env.LAN_STATIC_PORT || 8080);
const rootDir = path.resolve(process.cwd(), "dist");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
  ".cer": "application/pkix-cert",
};

function sendFile(res, filePath, statusCode = 200) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";
  const stream = fs.createReadStream(filePath);
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-cache",
  });
  stream.pipe(res);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("Internal Server Error");
  });
}

function resolvePath(urlPath) {
  const cleanPath = decodeURIComponent((urlPath || "/").split("?")[0]);
  const normalized = cleanPath === "/" ? "/index.html" : cleanPath;
  const targetPath = path.normalize(path.join(rootDir, normalized));
  if (!targetPath.startsWith(rootDir)) return null;
  return targetPath;
}

const server = http.createServer((req, res) => {
  const targetPath = resolvePath(req.url);
  if (!targetPath) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.stat(targetPath, (error, stats) => {
    if (!error && stats.isFile()) {
      sendFile(res, targetPath);
      return;
    }

    const fallback = path.join(rootDir, "index.html");
    fs.stat(fallback, (fallbackError, fallbackStats) => {
      if (!fallbackError && fallbackStats.isFile()) {
        sendFile(res, fallback);
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
    });
  });
});

server.listen(port, host, () => {
  console.log(`LAN static server listening on http://${host}:${port}`);
});
