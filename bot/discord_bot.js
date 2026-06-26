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
const { sendWol } = require('./wol');

// ---- 状態管理 ----
// agentSocket: ローカルエージェントとのWebSocket接続(未接続=PCが起動していない)
// mcServerOnline: エージェントから報告されたMinecraftサーバーの起動状態
// controlMessage: Discordに送った操作パネルのMessageオブジェクト(状態が変わるたびに編集する)
const state = {
  agentSocket: null,
  mcServerOnline: false,
  controlMessage: null,
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
      { name: 'PC', value: pcOnline ? '🟢 起動中' : '⚪ 停止中', inline: true },
      { name: 'サーバー', value: state.mcServerOnline ? '🟢 起動中' : '⚪ 停止中', inline: true }
    );

  const mainButton = new ButtonBuilder()
    .setCustomId('start')
    .setLabel(pcOnline ? 'サーバー起動' : 'PC起動')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(pcOnline && state.mcServerOnline);

  const stopButton = new ButtonBuilder()
    .setCustomId('stop')
    .setLabel('サーバー停止 & PC電源OFF')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(!state.mcServerOnline);

  const row = new ActionRowBuilder().addComponents(mainButton, stopButton);

  return { embeds: [embed], components: [row] };
}

async function refreshPanel() {
  if (!state.controlMessage) return;
  try {
    await state.controlMessage.edit(buildPanel());
  } catch (err) {
    console.error('操作パネルの更新に失敗しました:', err);
  }
}

// ---- Discord Bot ----
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const channel = await client.channels.fetch(config.CHANNEL_ID);
  state.controlMessage = await channel.send(buildPanel());
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'start') {
    if (isPcOnline()) {
      // PCは起動済み -> ローカルエージェントにサーバー起動を依頼
      state.agentSocket.send(JSON.stringify({ type: 'start_server' }));
      await interaction.reply({
        content: 'サーバー起動を指示しました。起動まで少々お待ちください。',
        ephemeral: true,
      });
    } else {
      // PCが起動していない -> WOLパケットを送信
      sendWol();
      await interaction.reply({
        content: 'PCの起動信号(WOL)を送信しました。起動には数十秒〜数分かかります。起動後、もう一度「サーバー起動」を押してください。',
        ephemeral: true,
      });
    }
    return;
  }

  if (interaction.customId === 'stop') {
    if (!isPcOnline() || !state.mcServerOnline) {
      await interaction.reply({ content: 'サーバーは現在起動していません。', ephemeral: true });
      return;
    }
    state.agentSocket.send(JSON.stringify({ type: 'stop_server' }));
    await interaction.reply({
      content: 'サーバーの停止とPCの電源OFFを指示しました。',
      ephemeral: true,
    });
  }
});

client.login(config.DISCORD_TOKEN);

// ---- HTTPサーバー(Render keep-alive用) + WebSocketサーバー(ローカルエージェント用) ----
const app = express();
app.get('/', (req, res) => res.send('Minecraft-Server-Starter bot is alive.'));

const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/agent' });

wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://localhost').searchParams.get('token');
  if (token !== config.AGENT_TOKEN) {
    ws.close(4001, 'unauthorized');
    return;
  }

  console.log('ローカルエージェントが接続しました(PCが起動しています)');
  state.agentSocket = ws;
  refreshPanel();

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (data.type === 'heartbeat') {
      const changed = state.mcServerOnline !== Boolean(data.mcServerOnline);
      state.mcServerOnline = Boolean(data.mcServerOnline);
      if (changed) refreshPanel();
    }
  });

  ws.on('close', () => {
    console.log('ローカルエージェントとの接続が切れました(PCがOFFになった可能性があります)');
    if (state.agentSocket === ws) {
      state.agentSocket = null;
      state.mcServerOnline = false;
      refreshPanel();
    }
  });
});

httpServer.listen(config.PORT, () => {
  console.log(`HTTPサーバーを起動しました (port ${config.PORT})`);
});
