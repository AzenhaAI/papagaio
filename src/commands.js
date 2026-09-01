// The command menu, in one place.
//
// Telegram caches this list per client, so it changes only when we publish it.
// It used to be published on /start and once a night, which meant a command
// added in the morning was invisible to everyone who had already started the
// bot — including the person who asked for it.

export async function publishCommands(env) {
  await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/setMyCommands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      commands: [
        { command: 'help',   description: '🦜 What I can do' },
        { command: 'tr',     description: '🔤 Translate a word or a phrase' },
        { command: 'news',   description: '📰 Today on the island, at your level' },
        { command: 'apps',   description: '🌍 The site and the apps — every link' },
        { command: 'course', description: '🎓 The course — lessons with a goal' },
        { command: 'talk',   description: '🎭 Free practice with the AI coach' },
        { command: 'stop',   description: '🏁 End the dialog + error recap' },
        { command: 'now',    description: 'A card right now' },
        { command: 'drill',  description: '📐 Practise grammar on demand' },
        { command: 'level',  description: '🎚 Start higher — skip what you know' },
        { command: 'skip',   description: '⏭ Mark a topic you already know' },
        { command: 'undo',   description: '↩️ Take back the last answer' },
        { command: 'export', description: '💾 Download everything as JSON' },
        { command: 'stats',  description: '📊 Statistics' },
        { command: 'lang',   description: 'Languages: PT / EN / both' },
        { command: 'pause',  description: 'Pause' },
        { command: 'resume', description: 'Resume' },
      ],
    }),
  });
}
