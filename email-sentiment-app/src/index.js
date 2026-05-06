import { config } from 'dotenv';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fetchEmails } from './gmail.js';
import { analyzeSentiment } from './sentiment.js';

config();

const STATE_FILE = './state.json';
const LOG_FILE = './sentiment-log.json';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MINUTES ?? '5') * 60 * 1000;

// ── State helpers ──────────────────────────────────────────────────────────────

function loadState() {
  if (existsSync(STATE_FILE)) {
    const s = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    return { processedUids: new Set(s.processedUids ?? []) };
  }
  return { processedUids: new Set() };
}

function saveState(state) {
  // Keep only the last 2000 UIDs to prevent unbounded growth
  const uids = [...state.processedUids].slice(-2000);
  writeFileSync(STATE_FILE, JSON.stringify({ processedUids: uids }, null, 2));
}

function loadLog() {
  return existsSync(LOG_FILE) ? JSON.parse(readFileSync(LOG_FILE, 'utf8')) : [];
}

function saveLog(entries) {
  writeFileSync(LOG_FILE, JSON.stringify(entries, null, 2));
}

// ── Console formatting ─────────────────────────────────────────────────────────

const COLOR = {
  positive: '\x1b[32m', // green
  negative: '\x1b[31m', // red
  neutral:  '\x1b[33m', // yellow
  unknown:  '\x1b[90m', // grey
  reset:    '\x1b[0m',
  dim:      '\x1b[2m',
  bold:     '\x1b[1m',
};

function printResult(email, result) {
  const c = COLOR[result.sentiment] ?? COLOR.unknown;
  const bar = '━'.repeat(50);
  console.log(`\n${c}${bar}${COLOR.reset}`);
  console.log(`  ${COLOR.bold}From:${COLOR.reset}      ${email.from}`);
  console.log(`  ${COLOR.bold}Subject:${COLOR.reset}   ${email.subject}`);
  console.log(`  ${COLOR.bold}Date:${COLOR.reset}      ${new Date(email.date).toLocaleString()}`);
  console.log(
    `  ${c}${COLOR.bold}Sentiment:${COLOR.reset} ${c}${result.sentiment?.toUpperCase()} ` +
    `(score: ${(result.score ?? 0).toFixed(2)}, confidence: ${result.confidence})${COLOR.reset}`,
  );
  console.log(`  ${COLOR.bold}Summary:${COLOR.reset}   ${result.summary}`);
  if (result.key_phrases?.length) {
    console.log(`  ${COLOR.bold}Key phrases:${COLOR.reset} ${result.key_phrases.join(' · ')}`);
  }
}

// ── Main poll loop ─────────────────────────────────────────────────────────────

async function poll() {
  const state = loadState();

  let emails;
  try {
    emails = await fetchEmails(state.processedUids);
  } catch (err) {
    console.error(`[${ts()}] ✗ Failed to fetch emails: ${err.message}`);
    return;
  }

  if (emails.length === 0) {
    console.log(`[${ts()}] No new emails.`);
    return;
  }

  console.log(`[${ts()}] Found ${emails.length} new email(s). Analyzing...`);

  const log = loadLog();

  for (const email of emails) {
    let result;
    try {
      result = await analyzeSentiment(email.from, email.subject, email.body);
    } catch (err) {
      console.error(`[${ts()}] ✗ Claude error for "${email.subject}": ${err.message}`);
      state.processedUids.add(email.uid); // skip this email next time
      continue;
    }

    printResult(email, result);

    log.push({
      analyzedAt: new Date().toISOString(),
      uid: email.uid,
      from: email.from,
      subject: email.subject,
      date: new Date(email.date).toISOString(),
      ...result,
    });

    state.processedUids.add(email.uid);
  }

  saveState(state);
  saveLog(log);
  console.log(`\n${COLOR.dim}[${ts()}] Log saved → ${LOG_FILE}${COLOR.reset}`);
}

function ts() {
  return new Date().toISOString();
}

async function main() {
  console.log(`${COLOR.bold}Email Sentiment Analyzer${COLOR.reset}`);
  console.log(`Polling every ${POLL_INTERVAL_MS / 60000} minute(s). Press Ctrl+C to stop.\n`);

  await poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
