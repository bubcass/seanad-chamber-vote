import fs from "fs/promises";

const OUTPUT_PATH = "public/data/voteDetails.json";
const API_URL = "https://api.oireachtas.ie/v1/divisions";
const DATE_START = "2025-11-25";
const MAX_RETRIES = 4;
const REQUEST_TIMEOUT_MS = 30_000;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(attempt) {
  const baseDelay = 1_000 * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 500);
  return baseDelay + jitter;
}

function buildVotesUrl() {
  const dateEnd = todayISO();
  return `${API_URL}?date_start=${DATE_START}&date_end=${dateEnd}&limit=500`;
}

function previewBody(bodyText) {
  return bodyText.replace(/\s+/g, " ").trim().slice(0, 200);
}

function isRetryableResponse(status, contentType) {
  if (RETRYABLE_STATUS_CODES.has(status)) return true;
  return Boolean(contentType && !contentType.includes("application/json"));
}

function extractSectionNumber(section) {
  if (!section) return "";
  return String(section).replace("dbsect_", "");
}

function buildDebateUrl(date, section) {
  const sectionNumber = extractSectionNumber(section);
  if (!date || !sectionNumber) return null;
  return `https://www.oireachtas.ie/en/debates/debate/seanad/${date}/${sectionNumber}/`;
}

async function fetchVotes() {
  const url = buildVotesUrl();
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    console.log(`→ Fetching (${attempt}/${MAX_RETRIES}): ${url}`);

    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "interactive-seanad-chamber-vote/0.0.0 (GitHub Actions vote fetch)",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const contentType = res.headers.get("content-type") || "";
      const bodyText = await res.text();

      if (!res.ok) {
        const message =
          `HTTP ${res.status} ${res.statusText}; ` +
          `content-type=${contentType || "unknown"}; ` +
          `body="${previewBody(bodyText)}"`;
        const error = new Error(message);

        if (attempt < MAX_RETRIES && isRetryableResponse(res.status, contentType)) {
          const retryDelayMs = getRetryDelayMs(attempt);
          console.warn(`↻ Retryable response, waiting ${retryDelayMs}ms: ${message}`);
          await sleep(retryDelayMs);
          continue;
        }

        throw error;
      }

      if (!contentType.includes("application/json")) {
        const message =
          `Expected JSON but received content-type=${contentType || "unknown"}; ` +
          `body="${previewBody(bodyText)}"`;

        if (attempt < MAX_RETRIES) {
          const retryDelayMs = getRetryDelayMs(attempt);
          console.warn(`↻ Non-JSON response, waiting ${retryDelayMs}ms: ${message}`);
          await sleep(retryDelayMs);
          continue;
        }

        throw new Error(message);
      }

      let json;
      try {
        json = JSON.parse(bodyText);
      } catch (error) {
        throw new Error(
          `Invalid JSON response; content-type=${contentType}; body="${previewBody(bodyText)}"; cause=${error.message}`,
        );
      }

      if (!json?.results) {
        throw new Error("No results returned from API");
      }

      return json.results;
    } catch (error) {
      lastError = error;

      if (attempt >= MAX_RETRIES) {
        break;
      }

      const retryDelayMs = getRetryDelayMs(attempt);
      console.warn(`↻ Fetch attempt failed, waiting ${retryDelayMs}ms: ${error.message}`);
      await sleep(retryDelayMs);
    }
  }

  throw lastError;
}

function transform(results) {
  return results
    .map((d) => {
      const division = d?.division;

      return {
        id: division?.voteId,

        tallies: division?.tallies,
        house: division?.chamber?.showAs,
        outcome: division?.outcome,

        debateShowAs: division?.debate?.showAs,
        subject: division?.subject?.showAs,
        tellers: division?.tellers,

        voteID: division?.voteId,
        date: d?.contextDate,
        section: division?.debate?.debateSection,

        debateUrl: buildDebateUrl(
          d?.contextDate,
          division?.debate?.debateSection,
        ),
      };
    })
    .filter((d) => d.house === "Seanad Éireann");
}

async function main() {
  try {
    const raw = await fetchVotes();
    const processed = transform(raw);

    await fs.mkdir("public/data", { recursive: true });
    await fs.writeFile(
      OUTPUT_PATH,
      JSON.stringify(processed, null, 2),
      "utf-8",
    );

    console.log(`✓ Wrote ${processed.length} votes → ${OUTPUT_PATH}`);
  } catch (err) {
    console.error("✗ Failed:", err);
    process.exit(1);
  }
}

main();
