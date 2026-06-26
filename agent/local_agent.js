require('dotenv').config();
const { exec } = require('child_process');
const WebSocket = require('ws');
const { Rcon } = require('rcon-client');

const config = {
  BOT_WS_URL: process.env.BOT_WS_URL,
  AGENT_TOKEN: process.env.AGENT_TOKEN,
  MC_RCON_HOST: process.env.MC_RCON_HOST || '127.0.0.1',
  MC_RCON_PORT: Number(process.env.MC_RCON_PORT || 25575),
  MC_RCON_PASSWORD: process.env.MC_RCON_PASSWORD,
  START_BAT_PATH: process.env.START_BAT_PATH,
  START_BAT_CWD: process.env.START_BAT_CWD,
  AUTO_SHUTDOWN_ENABLED: process.env.AUTO_SHUTDOWN_ENABLED === 'true',
  AUTO_SHUTDOWN_HOUR: Number(process.env.AUTO_SHUTDOWN_HOUR || 6),
};

let ws = null;

// ---- Minecraftサーバーの状態確認(RCON) ----
// 接続できればサーバー起動中、できなければ停止中とみなす(bat側の実装に依存しない方法)
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
    const match = res.match(/There are (\d+) of a max(?: of)? (\d+) players online/);
    const players = match ? Number(match[1]) : 0;
    return { online: true, players };
  } catch (err) {
    return { online: false, players: 0 };
  } finally {
    if (rcon) {
      try {
        rcon.end();
      } catch {
        // noop
      }
    }
  }
}

// ---- サーバー起動 ----
function startServer() {
  console.log('サーバー起動用batファイルを実行します:', config.START_BAT_PATH);
  exec(`"${config.START_BAT_PATH}"`, { cwd: config.START_BAT_CWD }, (err) => {
    if (err) console.error('batファイルの実行に失敗しました:', err);
  });
}

// ---- サーバー停止 & PC電源OFF ----
let stopInProgress = false;
async function stopServerAndShutdown() {
  if (stopInProgress) return;
  stopInProgress = true;

  console.log('サーバーへstopコマンドを送信します');
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
    console.error('RCONでのstopコマンド送信に失敗しました(既に停止している可能性があります):', err.message);
  }

  // サーバープロセスが完全に終了する(RCONに接続できなくなる)まで待つ。
  // ワールド保存の時間を確保するため最大5分待つ
  const maxWaitMs = 5 * 60 * 1000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 5000));
    const status = await getServerStatus();
    if (!status.online) break;
  }

  console.log('PCをシャットダウンします');
  exec('shutdown /s /t 10');
  stopInProgress = false;
}

// ---- Renderのbotへ常時接続するWebSocketクライアント ----
function connect() {
  ws = new WebSocket(`${config.BOT_WS_URL}?token=${config.AGENT_TOKEN}`);

  ws.on('open', () => {
    console.log('Botに接続しました');
  });

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (data.type === 'start_server') {
      startServer();
    } else if (data.type === 'stop_server') {
      stopServerAndShutdown();
    }
  });

  ws.on('close', () => {
    console.log('Botとの接続が切れました。5秒後に再接続します');
    setTimeout(connect, 5000);
  });

  ws.on('error', (err) => {
    console.error('WebSocketエラー:', err.message);
  });
}

// ---- ハートビート送信(サーバー状態をbotに伝える) ----
setInterval(async () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const status = await getServerStatus();
  ws.send(JSON.stringify({ type: 'heartbeat', mcServerOnline: status.online }));
}, 20000);

// ---- 自動シャットダウン監視(任意機能) ----
// 指定した時刻になった時点でプレイヤーが0人なら自動的にサーバー停止&PC電源OFFする
if (config.AUTO_SHUTDOWN_ENABLED) {
  setInterval(async () => {
    const now = new Date();
    if (now.getHours() !== config.AUTO_SHUTDOWN_HOUR || now.getMinutes() >= 5) return;

    const status = await getServerStatus();
    if (status.online && status.players === 0) {
      console.log(`${config.AUTO_SHUTDOWN_HOUR}時時点でプレイヤーが0人のため自動シャットダウンします`);
      await stopServerAndShutdown();
    }
  }, 5 * 60 * 1000);
}

connect();
