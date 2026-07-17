const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const config = require('./config');

const state = {
  agentSocket: null,
  mcServerOnline: false,
  players: [],
  controlMessage: null,
  playerListMessage: null,
};

function isPcOnline() {
  return state.agentSocket !== null && state.agentSocket.readyState === WebSocket.OPEN;
}

function buildPanel() {
  const pcOnline = isPcOnline();
  const embed = new EmbedBuilder()
    .setTitle('Minecraft Server Controls')
    .setColor(state.mcServerOnline ? 0x57f287 : pcOnline ? 0xfee75c : 0x99aab5)
    .addFields(
      { name: 'PC',       value: pcOnline             ? '🟢 起動中' : '⚪ 停止中', inline: true },
      { name: 'サーバー', value: state.mcServerOnline ? '🟢 起動中' : '⚪ 停止中', inline: true }
    );
  if (!pcOnline) embed.setFooter({ text: 'PCが起動していません。PCを手動で起動してください。' });

  const startButton = new ButtonBuilder()
    .setCustomId('start').setLabel('サーバー起動').setStyle(ButtonStyle.Primary)
    .setDisabled(!pcOnline || state.mcServerOnline);
  const stopButton = new ButtonBuilder()
    .setCustomId('stop').setLabel('サーバー停止').setStyle(ButtonStyle.Danger)
    .setDisabled(!pcOnline || !state.mcServerOnline);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(startButton, stopButton)] };
}

function buildPlayerList() {
  const embed = new EmbedBuilder()
    .setTitle('🎮 現在のプレイヤー')
    .setColor(state.players.length > 0 ? 0x57f287 : 0x99aab5)
    .setTimestamp();
  if (!isPcOnline() || !state.mcServerOnline) {
    embed.setDescription('サーバーは現在停止中です。');
  } else if (state.players.length === 0) {
    embed.setDescription('現在プレイヤーはいません。');
  } else {
    embed.setDescription(state.players.map(p => `• ${p}`).join('\n'));
    embed.setFooter({ text: `${state.players.length}人 オンライン` });
  }
  return { embeds: [embed] };
}

async function refreshPanel() {
  if (!state.controlMessage) return;
  try { await state.controlMessage.edit(buildPanel()); } catch (err) {
    console.error('操作パネルの更新に失敗:', err.message);
  }
}

async function refreshPlayerList() {
  if (!state.playerListMessage) return;
  try { await state.playerListMessage.edit(buildPlayerList()); } catch (err) {
    console.error('プレイヤー一覧の更新に失敗:', err.message);
  }
}

// 起動時にピン留めメッセージを再利用する。
// なければ新規送信してピン留め→以降は編集のみで通知が飛ばない。
const fs = require('fs');
const MESSAGE_IDS_PATH = require('path').join(__dirname, '..', 'message_ids.json');

function loadIds() {
  try { return JSON.parse(fs.readFileSync(MESSAGE_IDS_PATH, 'utf8')); }
  catch { return {}; }
}

function saveId(key, id) {
  const ids = loadIds();
  ids[key] = id;
  fs.writeFileSync(MESSAGE_IDS_PATH, JSON.stringify(ids));
}

async function getOrCreateMessage(channel, content, key) {
  const ids = loadIds();
  if (ids[key]) {
    try {
      const msg = await channel.messages.fetch(ids[key]);
      await msg.edit(content);
      console.log(`既存メッセージを再利用します (${key})`);
      return msg;
    } catch {
      console.log(`メッセージが見つかりません。新規送信します (${key})`);
    }
  }
  const msg = await channel.send(content);
  saveId(key, msg.id);
  console.log(`新規メッセージを送信しました (${key}: ${msg.id})`);
  return msg;
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  const controlChannel = await client.channels.fetch(config.CHANNEL_ID);
  state.controlMessage = await getOrCreateMessage(controlChannel, buildPanel(), 'control');
  const playerChannel = await client.channels.fetch(config.PLAYER_LIST_CHANNEL_ID);
  state.playerListMessage = await getOrCreateMessage(playerChannel, buildPlayerList(), 'playerList');
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (!isPcOnline()) {
    await interaction.reply({ content: '⚠️ PCが起動していません。PCを手動で起動してください。', ephemeral: true });
    return;
  }

  if (interaction.customId === 'start') {
    if (state.mcServerOnline) {
      await interaction.reply({ content: 'サーバーはすでに起動しています。', ephemeral: true });
      return;
    }
    state.agentSocket.send(JSON.stringify({ type: 'start_server' }));
    await interaction.reply({ content: 'サーバー起動を指示しました。起動まで少々お待ちください。', ephemeral: true });
  }

  if (interaction.customId === 'stop') {
    if (!state.mcServerOnline) {
      await interaction.reply({ content: 'サーバーはすでに停止しています。', ephemeral: true });
      return;
    }
    state.agentSocket.send(JSON.stringify({ type: 'stop_server' }));
    await interaction.reply({ content: 'サーバーとplayit.ggの停止を開始しました。', ephemeral: true });
  }
});

client.login(config.DISCORD_TOKEN);

const app = express();
app.get('/', (req, res) => res.send('Minecraft-Server-Starter bot is alive.'));

const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/agent' });

wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://localhost').searchParams.get('token');
  if (token !== config.AGENT_TOKEN) { ws.close(4001, 'unauthorized'); return; }

  console.log('ローカルエージェントが接続しました');
  state.agentSocket = ws;
  refreshPanel();

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return; }
    if (data.type === 'heartbeat') {
      const serverChanged  = state.mcServerOnline !== Boolean(data.mcServerOnline);
      const playersChanged = JSON.stringify(state.players) !== JSON.stringify(data.players || []);
      state.mcServerOnline = Boolean(data.mcServerOnline);
      state.players = Array.isArray(data.players) ? data.players : [];
      if (serverChanged) refreshPanel();
      if (serverChanged || playersChanged) refreshPlayerList();
    }
  });

  ws.on('close', () => {
    console.log('エージェントとの接続が切れました');
    if (state.agentSocket === ws) {
      state.agentSocket = null;
      state.mcServerOnline = false;
      state.players = [];
      refreshPanel();
      refreshPlayerList();
    }
  });
});

httpServer.listen(config.PORT, () => {
  console.log(`HTTPサーバーを起動しました (port ${config.PORT})`);
});