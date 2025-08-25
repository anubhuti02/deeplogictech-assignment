const http = require("http");
const https = require("https");

const PORT = process.env.PORT || 3000;
const TIME_URL = "https://time.com";

/* -------------------- HELPERS -------------------- */

// fetch raw HTML from a URL
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        resolve(data);
      });
    }).on("error", (err) => {
      reject(err);
    });
  });
}

// decode common HTML entities (&amp; → &, &quot; → ")
function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

/* -------------------- STORY SCRAPER -------------------- */

function extractLatestStories(html, count = 6) {
  let start = html.indexOf("LATEST STORIES");

  if (start === -1) {
    start = html.toLowerCase().indexOf("latest-stories");
  }

  let slice;
  if (start !== -1) {
    const ulStart = html.indexOf("<ul", start);
    const ulEnd = html.indexOf("</ul>", ulStart);
    if (ulStart !== -1 && ulEnd !== -1) {
      slice = html.slice(ulStart, ulEnd + 5);
    } else {
      slice = html.slice(start, start + 20000);
    }
  } else {
    slice = html;
  }

  const stories = [];
  let pos = 0;

  while (stories.length < count) {
    let aStart = slice.indexOf("<a", pos);
    if (aStart === -1) break;

    let hrefStart = slice.indexOf('href="', aStart);
    if (hrefStart === -1) {
      pos = aStart + 2;
      continue;
    }
    hrefStart += 6;
    let hrefEnd = slice.indexOf('"', hrefStart);
    if (hrefEnd === -1) break;
    let href = slice.substring(hrefStart, hrefEnd);

    let textStart = slice.indexOf(">", hrefEnd) + 1;
    let textEnd = slice.indexOf("</a>", textStart);
    if (textEnd === -1) break;
    let text = slice.substring(textStart, textEnd).trim();

    // strip inner tags
    while (text.includes("<")) {
      let t1 = text.indexOf("<");
      let t2 = text.indexOf(">", t1);
      if (t2 === -1) break;
      text = text.slice(0, t1) + text.slice(t2 + 1);
    }
    text = decodeEntities(text);

    // filtering rules
    if (!text) {
      pos = textEnd + 4;
      continue;
    }
    if (/read more|subscribe|sign in|newsletter|skip to content|your brief/i.test(text)) {
      pos = textEnd + 4;
      continue;
    }
    if (!href.startsWith("http") && !href.startsWith("/")) {
      pos = textEnd + 4;
      continue;
    }
    if (!/\s/.test(text)) {
      pos = textEnd + 4;
      continue;
    }
    if (!/\/\d{6,}/.test(href)) {
      pos = textEnd + 4;
      continue;
    }

    if (href.startsWith("/")) href = TIME_URL + href;

    stories.push({ title: text, link: href });

    pos = textEnd + 4;
  }

  return stories.slice(0, count);
}

async function getTimeStoriesJSON() {
  const html = await fetchHTML(TIME_URL);
  return extractLatestStories(html);
}

/* -------------------- SERVER -------------------- */

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url.startsWith("/getTimeStories")) {
    try {
      const data = await getTimeStoriesJSON();
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data, null, 2));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to fetch/parse", details: String(err) }));
    }
    return;
  }

  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    try {
      const data = await getTimeStoriesJSON();
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data, null, 2));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to fetch/parse", details: String(err) }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(PORT, () =>
  console.log(`Server running → http://localhost:${PORT}`)
);
