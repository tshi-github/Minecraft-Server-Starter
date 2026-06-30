// ルートのエントリポイント。
// 「node index.js bot」   -> Render上で動かすDiscord Bot本体を起動
// 「node index.js agent」 -> PCに常駐させるローカルエージェントを起動
//
// .envはこのファイルと同じルート直下の1つだけを参照する(bot/agent共通)。

const mode = process.argv[2];

if (mode === 'bot') {
  require('./bot/discord_bot.js');
} else if (mode === 'agent') {
  require('./agent/local_agent');
} else {
  console.error('起動モードを指定してください: node index.js bot  または  node index.js agent');
  process.exit(1);
}
