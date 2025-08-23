const http = require("http");
const https = require("https");

const PORT = process.env.PORT || 3000;
const TIME_URL = "https://time.com";

//fetch htmlfrom url
function getHTML(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",

        },
      },
      (res) => {
        // Handle redirects 
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          if (redirectsLeft <= 0) {
            reject(new Error("Too many redirects"));
            res.resume();
            return;
          }
          const next = res.headers.location.startsWith("http")
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          res.resume();
          resolve(getHTML(next, redirectsLeft - 1));
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} when fetching ${url}`));
          res.resume();
          return;
        }

        res.setEncoding("utf8");
        let html = "";
        res.on("data", (chunk) => (html += chunk));
        res.on("end", () => resolve(html));
      }
    );

    req.on("error", reject);
  });
}

//decode html entities
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–");
}

//etract stories
function extractLatestStories(html, count = 6) {

  let start = html.indexOf("LATEST STORIES");

  
  if (start === -1) {
    start = html.search(/latest-stories/i);
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
  const anchorRegex = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(slice)) !== null) {
    let href = match[1];
    let text = match[2];

   
    text = text.replace(/<[^>]+>/g, "").trim();
    text = decodeEntities(text);



    if (!text) continue;
if (/read more|subscribe|sign in|newsletter|skip to content|your brief/i.test(text)) continue;

if (!href.startsWith("http") && !href.startsWith("/")) continue;
if (!/\s/.test(text)) continue;
//for numeric id
if (!/\/\d{6,}/.test(href)) continue; 


    if (href.startsWith("/")) href = TIME_URL + href;

    if (/\s/.test(text)) {
      stories.push({ title: text, link: href });
    }

    if (stories.length >= count) break;
  }

  return stories.slice(0, count);
}

//fetches parses and returns json
async function getTimeStoriesJSON() {
  const html = await getHTML(TIME_URL);
  const items = extractLatestStories(html, 6);
  return items;
}

//create http server
const server = http.createServer(async (req, res) => {
  // routing
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
      res.end(

        JSON.stringify({ error: "Failed to fetch/parse", details: String(err) })
      );
    }
    return;
  }


if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
  const data = await getTimeStoriesJSON(); // fetch latest stories
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
  return;
}


  // Not found
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(PORT, () =>
  console.log(`Server running → http://localhost:${PORT}`)
);