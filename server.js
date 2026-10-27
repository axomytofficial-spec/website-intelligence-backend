
const express = require("express");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));

app.get("/", (req, res) => {
  res.json({
    name: "Website Intelligence",
    status: "online",
    version: "1.0.0"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    service: "Website Intelligence API",
    time: new Date().toISOString()
  });
});

app.get("/api/analyze", async (req, res) => {
  try {
    const input = req.query.url;

    if (typeof input !== "string" || input.length > 2048) {
      return res.status(400).json({
        error: "Provide a URL using ?url=https://example.com"
      });
    }

    const url = new URL(input);

    if (!["http:", "https:"].includes(url.protocol) ||
        url.username || url.password) {
      return res.status(400).json({ error: "Invalid website URL." });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let response;

    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "WebsiteIntelligence/1.0" }
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      return res.status(502).json({
        error: `Website returned HTTP ${response.status}.`
      });
    }

    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) {
      return res.status(400).json({
        error: "The URL did not return an HTML page."
      });
    }

    const html = await response.text();

    if (Buffer.byteLength(html, "utf8") > 1000000) {
      return res.status(413).json({ error: "Website page is too large." });
    }

    const $ = cheerio.load(html);
    const title = $("title").first().text().trim();
    const description =
      $('meta[name="description"]').attr("content") || "";
    const images = $("img");

    res.json({
      success: true,
      website: url.href,
      checkedAt: new Date().toISOString(),
      metrics: {
        httpStatus: response.status,
        https: url.protocol === "https:",
        title,
        titleLength: title.length,
        description: description.trim(),
        h1Count: $("h1").length,
        h2Count: $("h2").length,
        links: $("a[href]").length,
        images: images.length,
        imagesMissingAlt: images.filter((_, el) =>
          !$(el).attr("alt")?.trim()
        ).length
      },
      note: "Visitor and earnings data require connected analytics."
    });
  } catch (error) {
    res.status(502).json({
      error: error.name === "AbortError"
        ? "Website request timed out."
        : "Could not analyze the website. Check the URL and try again."
    });
  }
});

app.get("/api/pagespeed", async (req, res) => {
  try {
    const input = req.query.url;

    if (typeof input !== "string" || input.length > 2048) {
      return res.status(400).json({
        error: "Provide a URL using ?url=https://example.com"
      });
    }

    const url = new URL(input);

    if (!["http:", "https:"].includes(url.protocol) ||
        url.username || url.password) {
      return res.status(400).json({ error: "Invalid website URL." });
    }

    const api = new URL(
      "https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed"
    );

    api.searchParams.set("url", url.href);
    api.searchParams.set("strategy", "mobile");

    ["performance", "accessibility", "best-practices", "seo"]
      .forEach(category => api.searchParams.append("category", category));

    if (process.env.PSI_API_KEY) {
      api.searchParams.set("key", process.env.PSI_API_KEY);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    let response;
    let data;

    try {
      response = await fetch(api, { signal: controller.signal });
      data = await response.json();
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      return res.status(502).json({
        error: data?.error?.message || "Google PageSpeed request failed."
      });
    }

    const result = data.lighthouseResult;
    const score = key => {
      const value = result?.categories?.[key]?.score;
      return value == null ? null : Math.round(value * 100);
    };

    const audit = key =>
      result?.audits?.[key]?.displayValue ?? null;

    res.json({
      success: true,
      url: data.id,
      strategy: "mobile",
      scores: {
        performance: score("performance"),
        accessibility: score("accessibility"),
        bestPractices: score("best-practices"),
        seo: score("seo")
      },
      metrics: {
        firstContentfulPaint: audit("first-contentful-paint"),
        largestContentfulPaint: audit("largest-contentful-paint"),
        speedIndex: audit("speed-index"),
        totalBlockingTime: audit("total-blocking-time"),
        cumulativeLayoutShift: audit("cumulative-layout-shift")
      },
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(502).json({
      error: error.name === "AbortError"
        ? "PageSpeed request timed out."
        : "PageSpeed request failed. Try again later."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Website Intelligence listening on port ${PORT}`);
});
