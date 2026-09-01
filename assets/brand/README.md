# Brand files

Kept here so they can be found again. The bot's avatar in particular went
missing from Telegram once and nobody could say when or why — the file itself
was nowhere in the repo, only in the app's icon set, which is not where anyone
would look for it.

- `bot-avatar-512.png` — the Telegram bot's profile photo, 512×512, generated
  from `papagaio_app/assets/icon/icon.png`. Telegram crops it to a circle.
  Set it in BotFather: `/setuserpic` → `@papagaio_ebot` → send the file.
  There is no Bot API method for this; BotFather is the only way.
