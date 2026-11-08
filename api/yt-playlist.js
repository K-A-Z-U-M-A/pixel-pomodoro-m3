const https = require('node:https');

function fetchHtml(targetUrl, redirects = 3) {
  return new Promise((resolve, reject) => {
    https
      .get(
        targetUrl,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
          },
        },
        (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location &&
            redirects > 0
          ) {
            const nextUrl = new URL(res.headers.location, targetUrl).toString();
            res.resume();
            resolve(fetchHtml(nextUrl, redirects - 1));
            return;
          }
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => resolve(body));
        }
      )
      .on('error', reject);
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
                const txt =
                  ov.thumbnailBottomOverlayViewModel?.badges?.[0]?.thumbnailBadgeViewModel?.text;
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
        /* ignore */
      }
    }
  }
  return tracks;
}

module.exports = async (req, res) => {
  const listId = req.query?.list || '';
  if (!listId || !/^[A-Za-z0-9_-]+$/.test(listId)) {
    res.status(400).json({ tracks: [] });
    return;
  }
  try {
    const html = await fetchHtml(
      `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}&hl=es`
    );
    const tracks = extractPlaylistTracksFromHtml(html);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json({ tracks });
  } catch {
    res.status(200).json({ tracks: [] });
  }
};
