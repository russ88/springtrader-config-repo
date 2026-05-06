import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBody(parsed) {
  if (parsed.text) return parsed.text.slice(0, 5000);
  if (parsed.html) return stripHtml(parsed.html).slice(0, 5000);
  return '';
}

export async function fetchEmails(processedUids = new Set()) {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    logger: false,
  });

  await client.connect();

  const emails = [];
  const lock = await client.getMailboxLock('INBOX');

  try {
    // Search for all currently unseen messages
    const uids = await client.search({ seen: false }, { uid: true });

    for (const uid of uids) {
      if (processedUids.has(uid)) continue;

      const message = await client.fetchOne(
        uid.toString(),
        { source: true },
        { uid: true },
      );

      if (!message) continue;

      const parsed = await simpleParser(message.source);

      emails.push({
        uid,
        from: parsed.from?.text ?? 'Unknown',
        subject: parsed.subject ?? '(no subject)',
        date: parsed.date ?? new Date(),
        body: extractBody(parsed),
      });
    }
  } finally {
    lock.release();
    await client.logout();
  }

  return emails;
}
