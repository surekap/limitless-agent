'use strict';
const fs = require('fs');
const path = require('path');
const pool = require('./db');

const MEDIA_DIR = process.env.MEDIA_DIR || path.join(require('os').homedir(), '.secondbrain-media', 'wa');

function ensureDir() {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

/**
 * Download media for a whatsapp-web.js Message object and store to disk.
 * Non-fatal: logs errors but does not throw.
 * Returns { filepath, mimetype } or null.
 */
async function downloadAndStore(msg) {
  if (!msg.hasMedia) return null;
  try {
    ensureDir();
    const msgId = msg.id._serialized;

    // Check if already downloaded
    const { rows } = await pool.query('SELECT file_path FROM media_files WHERE wa_msg_id = $1', [msgId]);
    if (rows.length > 0 && fs.existsSync(rows[0].file_path)) {
      return { filepath: rows[0].file_path, mimetype: rows[0].mime_type };
    }

    const media = await msg.downloadMedia();
    if (!media || !media.data) return null;

    const ext = (media.mimetype || 'application/octet-stream').split('/')[1]?.split(';')[0]?.replace('+', '_') || 'bin';
    const safeName = msgId.replace(/[^a-zA-Z0-9_\-@.]/g, '_');
    const filename = `${safeName}.${ext}`;
    const filepath = path.join(MEDIA_DIR, filename);

    const buf = Buffer.from(media.data, 'base64');
    fs.writeFileSync(filepath, buf);

    await pool.query(
      `INSERT INTO media_files (wa_msg_id, chat_id, file_path, mime_type, file_size)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (wa_msg_id) DO UPDATE SET file_path = EXCLUDED.file_path, mime_type = EXCLUDED.mime_type, file_size = EXCLUDED.file_size`,
      [msgId, msg.from || msg.id.remote, filepath, media.mimetype, buf.length]
    );

    return { filepath, mimetype: media.mimetype };
  } catch (err) {
    console.error(`[media] download failed for ${msg.id?._serialized}: ${err.message}`);
    return null;
  }
}

module.exports = { downloadAndStore, MEDIA_DIR };
