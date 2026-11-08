const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT) || 4173;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function fetchHtml(targetUrl, redirects = 3) {
  return new Promise((resolve, reject) => {
    https.get(
      targetUrl,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
          const nextUrl = new URL(res.headers.location, targetUrl).toString();
          res.resume();
          resolve(fetchHtml(nextUrl, redirects - 1));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve(body));
      }
    ).on('error', reject);
  });
}

function extractPlaylistTracksFromHtml(html) {
  const tracks = [];
  const seen = new Set();

  const marker = 'var ytInitialData = ';
  const startIdx = html.indexOf(marker);
  if (startIdx !== -1) {
    const after = html.slice(startIdx + marker.length);
    const endIdx = after.indexOf(';</script>');
    if (endIdx !== -1) {
      try {
        const data = JSON.parse(after.slice(0, endIdx));
        const walk = (node) => {
          if (!node || typeof node !== 'object') return;

          // Format A: Classic playlistVideoRenderer / playlistPanelVideoRenderer
          if (node.playlistVideoRenderer || node.playlistPanelVideoRenderer) {
            const r = node.playlistVideoRenderer || node.playlistPanelVideoRenderer;
            const vid = r.videoId;
            if (vid && !seen.has(vid)) {
              seen.add(vid);
              const title =
                r.title?.runs?.[0]?.text ||
                r.title?.simpleText ||
                `Pista ${tracks.length + 1}`;
              const author =
                r.shortBylineText?.runs?.[0]?.text ||
                r.longBylineText?.runs?.[0]?.text ||
                'YouTube Music';
              const length =
                r.lengthText?.simpleText ||
                r.lengthText?.runs?.[0]?.text ||
                '';
              tracks.push({
                index: tracks.length,
                videoId: vid,
                title,
                author,
                duration: length,
                thumb: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`,
              });
            }
          }

          // Format B: Modern YouTube / YouTube Music lockupViewModel
          if (node.lockupViewModel && node.lockupViewModel.contentId) {
            const vm = node.lockupViewModel;
            const vid = vm.contentId;
            if (vid && typeof vid === 'string' && vid.length === 11 && !seen.has(vid)) {
              seen.add(vid);
              const title =
                vm.metadata?.lockupMetadataViewModel?.title?.content ||
                `Pista ${tracks.length + 1}`;
              const author =
                vm.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content ||
                'YouTube Music';
              const overlays = vm.contentImage?.thumbnailViewModel?.overlays || [];
              let duration = '';
              for (const ov of overlays) {
                const txt = ov.thumbnailBottomOverlayViewModel?.badges?.[0]?.thumbnailBadgeViewModel?.text;
                if (txt) {
                  duration = txt;
                  break;
                }
              }
              tracks.push({
                index: tracks.length,
                videoId: vid,
                title,
                author,
                duration,
                thumb: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`,
              });
            }
          }

          for (const k of Object.keys(node)) {
            walk(node[k]);
          }
        };
        walk(data);
      } catch {
        /* fallback below */
      }
    }
  }
  return tracks;
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || '/', `http://localhost:${PORT}`);
  const urlPath = decodeURIComponent(parsedUrl.pathname);

  // API Endpoint to resolve YouTube / YouTube Music playlist track titles & authors
  if (urlPath === '/api/yt-playlist') {
    const listId = parsedUrl.searchParams.get('list') || '';
    if (!listId || !/^[A-Za-z0-9_-]+$/.test(listId)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ tracks: [] }));
      return;
    }
    try {
      const html = await fetchHtml(`https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}&hl=es`);
      const tracks = extractPlaylistTracksFromHtml(html);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ tracks }));
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ tracks: [] }));
    }
    return;
  }

  const relPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, relPath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Pomodoro Material 3 Expressive disponible en http://localhost:${PORT}`);
});
