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

  // ローカルエージェントとの接続を認証するための共有シークレット
  AGENT_TOKEN: required('AGENT_TOKEN'),

  // 起動したいPCのMACアドレス (例: 20:DE:20:DE:20:DE)
  MAC_ADDRESS: required('MAC_ADDRESS'),

  // WOLパケットを送る宛先。自宅のDDNSホスト名(ルーターでポート転送設定が必要)
  WOL_TARGET_HOST: required('WOL_TARGET_HOST'),
  WOL_TARGET_PORT: Number(process.env.WOL_TARGET_PORT || 9),

  // RenderがPORT環境変数を自動で渡してくる。ローカル動作確認用に既定値も用意
  PORT: Number(process.env.PORT || 3000),
};
