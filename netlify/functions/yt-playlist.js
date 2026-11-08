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

const parseHelper = require('../../api/yt-playlist.js');

exports.handler = async (event) => {
  const listId = event.queryStringParameters?.list || '';
  if (!listId || !/^[A-Za-z0-9_-]+$/.test(listId)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ tracks: [] }),
    };
  }

  let statusCode = 200;
  let payload = { tracks: [] };
  const fakeRes = {
    setHeader() {},
    status(code) {
      statusCode = code;
      return this;
    },
    json(obj) {
      payload = obj;
    },
  };

  await parseHelper({ query: { list: listId } }, fakeRes);
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  };
};
