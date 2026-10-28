-- The bot's interface language and where its translations go (src/bot_lang.js).
-- Both NULL by default: NULL ui follows the Telegram client's language, NULL
-- tr_to applies the app's rule (Portuguese into the interface language,
-- anything else into Portuguese).
ALTER TABLE users ADD COLUMN ui TEXT;
ALTER TABLE users ADD COLUMN tr_to TEXT;
