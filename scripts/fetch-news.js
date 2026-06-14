const fs = require("node:fs/promises");
const path = require("node:path");
const Parser = require("rss-parser");

const parser = new Parser({
  timeout: 15000
});

const FEEDS = [
  {
    source: "AWS What's New",
    url: "https://aws.amazon.com/about-aws/whats-new/recent/feed/"
  },
  {
    source: "AWS News Blog",
    url: "https://aws.amazon.com/blogs/aws/feed/"
  },
  {
    source: "AWS Architecture Blog",
    url: "https://aws.amazon.com/blogs/architecture/feed/"
  },
  {
    source: "AWS Security Blog",
    url: "https://aws.amazon.com/blogs/security/feed/"
  }
];

const normalizeUrl = (url) => {
  if (!url || typeof url !== "string") return "";
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "sc_channel",
      "sc_campaign",
      "sc_medium"
    ];
    trackingParams.forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString();
  } catch {
    return url.trim();
  }
};

const toIsoDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const parseFeed = async ({ source, url }) => {
  const feed = await parser.parseURL(url);
  return (feed.items || [])
    .map((item) => {
      const link = normalizeUrl(item.link || item.guid || "");
      const pubDate = toIsoDate(item.isoDate || item.pubDate || item.dcDate);

      if (!item.title || !link || !pubDate) return null;

      return {
        title: item.title.trim(),
        link,
        source,
        pubDate,
        summary: (item.contentSnippet || item.summary || "").trim()
      };
    })
    .filter(Boolean);
};

const deduplicateByLink = (items) => {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    if (seen.has(item.link)) continue;
    seen.add(item.link);
    unique.push(item);
  }
  return unique;
};

const main = async () => {
  try {
    const allFeedItems = await Promise.all(FEEDS.map(parseFeed));
    const combined = allFeedItems.flat();
    const unique = deduplicateByLink(combined);

    unique.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

    const payload = {
      lastUpdated: new Date().toISOString(),
      items: unique.slice(0, 30).map(({ title, link, source, pubDate, summary }) => ({
        title,
        link,
        source,
        pubDate,
        summary
      }))
    };

    const outputPath = path.resolve(__dirname, "..", "news.json");
    await fs.writeFile(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
    console.log(`news.json updated with ${payload.items.length} items.`);
  } catch (error) {
    console.error("Failed to fetch RSS feeds:", error);
    process.exitCode = 1;
  }
};

main();
