// Render上のBotを24時間起動させ続けるためのGoogle Apps Script
// Practice-Scheduleと同じ方式: 定期的にBotのURLへリクエストを送ってスリープを防ぐ

function keepAlive() {
  const url = 'https://your-app.onrender.com/'; // ←Renderデプロイ後の実際のURLに変更
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    console.log('Keep-alive ping: ' + res.getResponseCode());
  } catch (err) {
    console.error('Keep-aliveに失敗しました: ' + err);
  }
}

// 初回セットアップ用: 5分おきにkeepAliveを実行するトリガーを作成する
// スクリプトエディタでこの関数を1回だけ実行すればよい
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('keepAlive').timeBased().everyMinutes(5).create();
}
