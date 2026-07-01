require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { Rcon } = require('rcon-client');

const config = {
  BOT_WS_URL:        process.env.BOT_WS_URL,
  AGENT_TOKEN:       process.env.AGENT_TOKEN,
  MC_RCON_HOST:      process.env.MC_RCON_HOST || '127.0.0.1',
  MC_RCON_PORT:      Number(process.env.MC_RCON_PORT || 25575),
  MC_RCON_PASSWORD:  process.env.MC_RCON_PASSWORD,
  START_BAT_PATH:    process.env.START_BAT_PATH,   // Minecraftサーバー起動batの絶対パス
  START_BAT_CWD:     process.env.START_BAT_CWD,    // batを実行する作業ディレクトリ
  PLAYITGG_PATH:     process.env.PLAYITGG_PATH,     // playit.gg実行ファイルの絶対パス
  PLAYITGG_CWD:      process.env.PLAYITGG_CWD,     // playit.ggの作業ディレクトリ
};

// ---- 子プロセス管理 ----
let playitProcess = null;
let mcProcess     = null;
let ws            = null;

// ---- RCON: サーバー状態とプレイヤー一覧を取得 ----
async function getServerStatus() {
  let rcon;
  try {
    rcon = await Rcon.connect({
      host: config.MC_RCON_HOST,
      port: config.MC_RCON_PORT,
      password: config.MC_RCON_PASSWORD,
      timeout: 3000,
    });
    const res = await rcon.send('list');
    // 例: "There are 2 of a max of 20 players online: Alice, Bob"
    const match = res.match(/There are (\d+) of a max(?: of)? \d+ players online[:\.]?\s*(.*)/);
    const count   = match ? Number(match[1]) : 0;
    const players = (count > 0 && match[2]) ? match[2].split(',').map(s => s.trim()).filter(Boolean) : [];
    return { online: true, players };
  } catch {
    return { online: false, players: [] };
  } finally {
    try { if (rcon) rcon.end(); } catch { /* noop */ }
  }
}

// ---- サーバー起動 ----
function startServer() {
  if (mcProcess) {
    console.log('サーバーはすでに起動中です');
    return;
  }
  console.log('Minecraftサーバーを起動します:', config.START_BAT_PATH);
  mcProcess = spawn('cmd.exe', ['/c', config.START_BAT_PATH], {
    cwd: config.START_BAT_CWD,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  mcProcess.stdout.on('data', d => process.stdout.write('[MC] ' + d));
  mcProcess.stderr.on('data', d => process.stderr.write('[MC] ' + d));
  mcProcess.on('exit', () => {
    console.log('Minecraftサーバープロセスが終了しました');
    mcProcess = null;
  });

}

// ---- 停止シーケンス ----
// 順序: 1) playit.gg を q -> y で終了  2) Minecraftサーバーを RCON stop  3) PC シャットダウン
let stopInProgress = false;
async function stopAll() {
  if (stopInProgress) return;
  stopInProgress = true;

  // 1. playit.gg を q -> y で終了
  if (playitProcess) {
    console.log('playit.gg を停止します (q -> y)');
    try {
      playitProcess.stdin.write('q\n');
      await new Promise(r => setTimeout(r, 1000));
      playitProcess.stdin.write('y\n');
      // プロセス終了を最大10秒待つ
      await Promise.race([
        new Promise(r => playitProcess.once('exit', r)),
        new Promise(r => setTimeout(r, 10000)),
      ]);
    } catch (err) {
      console.error('playit.gg 停止中にエラー:', err.message);
    }
    // まだ生きていれば強制終了
    if (playitProcess) {
      try { playitProcess.kill(); } catch { /* noop */ }
      await new Promise(r => setTimeout(r, 2000));
    }
    console.log('playit.gg を停止しました');
  }

  // 2. Minecraftサーバーを RCON stop
  console.log('Minecraftサーバーに stop を送信します');
  try {
    const rcon = await Rcon.connect({
      host: config.MC_RCON_HOST,
      port: config.MC_RCON_PORT,
      password: config.MC_RCON_PASSWORD,
      timeout: 3000,
    });
    await rcon.send('stop');
    rcon.end();
  } catch (err) {
    console.error('RCON stop に失敗しました:', err.message);
    // RCONが繋がらない場合はプロセスに直接 Ctrl+C (SIGINT)
    if (mcProcess) {
      try { mcProcess.kill('SIGINT'); } catch { /* noop */ }
    }
  }

  // サーバープロセスが終了するまで最大5分待つ
  const deadline = Date.now() + 5 * 60 * 1000;
  while (mcProcess && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
  }
  console.log('Minecraftサーバーが停止しました');

  // 3. PC シャットダウン
  console.log('PCをシャットダウンします');
  const { exec } = require('child_process');
  //exec('shutdown /s /t 10');
  stopInProgress = false;
}

// ---- Bot との WebSocket 常時接続 ----
function connect() {
  ws = new WebSocket(`${config.BOT_WS_URL}?token=${config.AGENT_TOKEN}`);

  ws.on('open', () => console.log('Bot に接続しました'));

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return; }
    if (data.type === 'start_server') startServer();
    if (data.type === 'stop_server')  stopAll();
  });

  ws.on('close', () => {
    console.log('Bot との接続が切れました。5秒後に再接続します');
    setTimeout(connect, 5000);
  });

  ws.on('error', err => console.error('WebSocket エラー:', err.message));
}

// ---- ハートビート: 20秒ごとに状態を Bot に送る ----
setInterval(async () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const status = await getServerStatus();
  ws.send(JSON.stringify({
    type: 'heartbeat',
    mcServerOnline: status.online,
    players: status.players,
  }));
}, 20000);

connect();
