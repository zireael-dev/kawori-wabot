const db = require('./database');
const translate = require('google-translate-api-x');

// The default language you write your bot text in (e.g., 'id' for Indonesian)
const BASE_LANG = 'id';

// Pre-compile SQLite queries for speed
const getLangStmt = db.prepare('SELECT lang FROM chat_settings WHERE jid = ?');
const setLangStmt = db.prepare(`
INSERT INTO chat_settings (jid, lang) VALUES (@jid, @lang)
ON CONFLICT(jid) DO UPDATE SET lang = @lang;
`);
const getCacheStmt = db.prepare('SELECT translated_text FROM translations_cache WHERE original_text = ? AND target_lang = ?');
const saveCacheStmt = db.prepare('INSERT OR IGNORE INTO translations_cache (original_text, target_lang, translated_text) VALUES (?, ?, ?)');

/**
 * Get the current language setting for a specific WhatsApp chat/group
 */
function getChatLang(jid) {
    const row = getLangStmt.get(jid);
    return row ? row.lang : BASE_LANG;
}

/**
 * Change and save the language setting for a specific WhatsApp chat/group
 */
function setChatLang(jid, lang) {
    setLangStmt.run({ jid, lang });
}

/**
 * Translates raw text on the fly and caches it in SQLite.
 * Usage: const text = await t('Halo dunia!', jid);
 */
async function t(text, jid) {
    const targetLang = getChatLang(jid);

    // 1. If target language is the same as our base language, no translation needed!
    if (targetLang === BASE_LANG) {
        return text;
    }

    // 2. Check if SQLite already cached this exact translation before
    const cached = getCacheStmt.get(text, targetLang);
    if (cached) {
        return cached.translated_text;
    }

    // 3. Not in cache! Translate on-the-fly using Google Translate
    try {
        const res = await translate(text, { from: BASE_LANG, to: targetLang });
        const translatedText = res.text;

        // 4. Save to SQLite so it loads instantly (0ms) next time
        saveCacheStmt.run(text, targetLang, translatedText);

        return translatedText;
    } catch (error) {
        console.error('[TRANSLATE ERROR] Falling back to original text:', error.message);
        return text; // Fallback to your original text if offline or if an error occurs
    }
}

module.exports = { t, getChatLang, setChatLang };
