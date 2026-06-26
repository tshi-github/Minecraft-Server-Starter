const wol = require('wake_on_lan');
const config = require('./config');

/**
 * 自宅ルーター(DDNSホスト名)宛にWOLマジックパケットを送信する。
 * ルーター側で「WAN→LANブロードキャスト」へのポート転送設定が済んでいることが前提。
 */
function sendWol() {
  wol.wake(
    config.MAC_ADDRESS,
    {
      address: config.WOL_TARGET_HOST,
      port: config.WOL_TARGET_PORT,
    },
    (err) => {
      if (err) {
        console.error('WOLパケットの送信に失敗しました:', err);
      } else {
        console.log('WOLパケットを送信しました:', config.WOL_TARGET_HOST, config.WOL_TARGET_PORT);
      }
    }
  );
}

module.exports = { sendWol };
