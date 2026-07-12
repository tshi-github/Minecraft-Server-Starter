require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { spawn, exec } = require('child_process');
const WebSocket = require('ws');
const { Rcon } = require('rcon-client');

const config = {
  BOT_WS_URL:       process.env.BOT_WS_URL,
  AGENT_TOKEN:      process.env.AGENT_TOKEN,
  MC_RCON_HOST:     process.env.MC_RCON_HOST || '127.0.0.1',
  MC_RCON_PORT:     Number(process.env.MC_RCON_PORT || 25575),
  MC_RCON_PASSWORD: process.env.MC_RCON_PASSWORD,
  START_BAT_PATH:   process.env.START_BAT_PATH,
  START_BAT_CWD:    process.env.START_BAT_CWD,
  STOP_BAT_PATH:    process.env.STOP_BAT_PATH,
};

let ws = null;

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

async function startServer() {
  const status = await getServerStatus();
  if (status.online) { console.log('サーバーはすでに起動中です'); return; }

  const fs = require('fs');
  if (!fs.existsSync(config.START_BAT_PATH)) {
    console.error('START_BAT_PATHが存在しません:', config.START_BAT_PATH); return;
  }
  if (config.START_BAT_CWD && !fs.existsSync(config.START_BAT_CWD)) {
    console.error('START_BAT_CWDが存在しません:', config.START_BAT_CWD); return;
  }

  console.log('start.batを実行します:', config.START_BAT_PATH);
  const launcher = spawn('cmd.exe', ['/c', config.START_BAT_PATH], {
    cwd: config.START_BAT_CWD,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  launcher.stdout.on('data', d => process.stdout.write('[start.bat] ' + d));
  launcher.stderr.on('data', d => process.stderr.write('[start.bat] ' + d));
  launcher.on('error', err => console.error('start.batの起動に失敗しました:', err.message));
}

let stopInProgress = false;
async function stopAll() {
  if (stopInProgress) return;
  stopInProgress = true;

  const fs = require('fs');
  if (!config.STOP_BAT_PATH || !fs.existsSync(config.STOP_BAT_PATH)) {
    console.error('STOP_BAT_PATHが存在しません:', config.STOP_BAT_PATH);
    stopInProgress = false; return;
  }

  console.log('stop_server.batを実行します:', config.STOP_BAT_PATH);
  const stopper = spawn('cmd.exe', ['/c', config.STOP_BAT_PATH], {
    cwd: require('path').dirname(config.STOP_BAT_PATH),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  stopper.stdout.on('data', d => process.stdout.write('[stop.bat] ' + d));
  stopper.stderr.on('data', d => process.stderr.write('[stop.bat] ' + d));
  stopper.on('error', err => {
    console.error('stop_server.batの起動に失敗しました:', err.message);
    stopInProgress = false;
  });

  await Promise.race([
    new Promise(r => stopper.once('exit', r)),
    new Promise(r => setTimeout(r, 30000)),
  ]);
  console.log('stop_server.batが完了しました。サーバーの終了を待ちます...');

  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const status = await getServerStatus();
    if (!status.online) break;
  }
  console.log('Minecraftサーバーが停止しました');
  stopInProgress = false;
}

function connect() {
  ws = new WebSocket(`${config.BOT_WS_URL}?token=${config.AGENT_TOKEN}`);
  ws.on('open', () => console.log('Bot に接続しました'));
  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return; }
    if (data.type === 'start_server') startServer();
    if (data.type === 'stop_server')  stopAll();
  });
  ws.on('close', () => { console.log('Bot との接続が切れました。5秒後に再接続します'); setTimeout(connect, 5000); });
  ws.on('error', err => console.error('WebSocket エラー:', err.message));
}

setInterval(async () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const status = await getServerStatus();
  ws.send(JSON.stringify({ type: 'heartbeat', mcServerOnline: status.online, players: status.players }));
}, 20000);

connect();