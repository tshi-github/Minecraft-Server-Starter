require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません。.env を確認してください。`);
  }
  return value;
}

module.exports = {
  DISCORD_TOKEN: required('DISCORD_TOKEN'),
  CHANNEL_ID: required('CHANNEL_ID'),
  AGENT_TOKEN: required('AGENT_TOKEN'),

  // プレイヤー一覧を表示する専用チャンネル(ロール管理でプライベートにする)
  PLAYER_LIST_CHANNEL_ID: required('PLAYER_LIST_CHANNEL_ID'),

  // RenderがPORT環境変数を自動で渡してくる。ローカル動作確認用に既定値も用意
  PORT: Number(process.env.PORT || 3000),
};
