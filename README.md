# Minecraft-Server-Starter

Discordのボタン操作で、自宅PCの起動(Wake-on-LAN)とMinecraftサーバーの起動/停止/PC電源OFFを行うBotです。

## 全体構成

Botの本体(`bot/`)はRender上で24時間稼働させ、自宅PC(`agent/`)とはWebSocketで常時接続します。

- **PCが完全に電源OFFの時**: Botから自宅ルーター宛にWOL(Wake-on-LAN)パケットを送り、ルーターがLAN内にブロードキャスト転送してPCを起動します。
- **PCが起動している時**: PC上で常駐している`agent/`がBotとWebSocketで繋がっているので、Botからの指示(サーバー起動bat実行・サーバー停止・PCシャットダウン)を即座に受け取って実行します。
- **GAS(`gas/keep_alive.gs`)**: Render(無料プラン)が一定時間アクセスがないとスリープしてしまうのを防ぐため、定期的にBotのURLへpingを送ります。Practice-Scheduleと同じ方式です。

```
Discord(ボタン) → Render上のBot ──┬─ PCがOFFの時: WOLパケット → 自宅ルーター(転送+DDNS) → PCのNIC
                                    └─ PCがONの時: WebSocket常時接続 → ローカルエージェント → bat実行 / RCONで停止
```

## フォルダ構成

```
Minecraft-Server-Starter/
├── bot/      Renderにデプロイするもの(Discord Bot本体)
├── agent/    自宅PCに常駐させるもの(ローカルエージェント)
└── gas/      Render keep-alive用のGoogle Apps Script
```

---

## セットアップ手順

### 1. Discord Botを作成する

1. [Discord Developer Portal](https://discord.com/developers/applications) でアプリケーションを新規作成
2. 「Bot」タブでBotを作成し、トークンを発行(`DISCORD_TOKEN`として使う)
3. 「OAuth2 > URL Generator」で scope に `bot` を選び、権限に `Send Messages` `Embed Links` を選んでURLを生成、自分のサーバーに招待する
4. 操作パネルを表示したいDiscordのチャンネルを開き、チャンネル名を右クリック →「IDをコピー」(`CHANNEL_ID`として使う。Discordの「開発者モード」を事前にONにしておく必要があります: ユーザー設定→詳細設定)

### 2. PC側でWake-on-LANを有効にする

1. **BIOS/UEFI設定**: PC起動時にBIOS/UEFI画面に入り、電源管理関連の項目から「Wake on LAN」「Power On by PCI-E/PCI」などを有効にする
2. **Windowsのネットワークアダプタ設定**:
   - デバイスマネージャー → ネットワークアダプター → 使用中のアダプターを右クリック →プロパティ
   - 「電源の管理」タブ →「このデバイスで、コンピューターのスタンバイ状態を解除できるようにする」にチェック
   - 「詳細設定」タブ →「Wake on Magic Packet」を有効にする
3. **高速スタートアップを無効化**(完全シャットダウン後のWOLが不安定になる場合があるため): コントロールパネル → 電源オプション →「シャットダウン設定」→「高速スタートアップを有効にする」のチェックを外す
4. PCのMACアドレス(有線LANのアダプターのもの)を `ipconfig /all` で確認しておく(`MAC_ADDRESS`として使う)

### 3. ルーターを設定する(WOLをインターネット経由で行うために)★今回もっとも重要な部分

Botはご自宅のLANの外(クラウド)で動くため、PCが電源OFFの状態に対してWOLパケットを届けるには、ルーターに「外から来たWOLパケットをLAN内にブロードキャスト転送する」設定と、IPアドレスが変わっても繋がるようにする「DDNS」設定の両方が必要です。

1. **ルーターの管理画面を開く**: ブラウザで `http://192.168.1.1` または `http://192.168.0.1` (ルーター本体のラベルに記載がある場合が多いです)
2. **メーカー・型番を確認**: ルーター本体のラベル、または管理画面の「システム情報」などに表記があります。型番が分かれば、より具体的な手順を案内できます。
3. **探すべき設定項目**(呼び方はメーカーによって異なります): 「ポートフォワーディング」「ポートマッピング」「静的IPマスカレード」「仮想サーバー」など。以下を設定します。
   - プロトコル: UDP
   - 外部(WAN)ポート: 任意の番号(例: `40000`。ポート9をそのまま外部公開するのは避けた方が安全)
   - 内部(LAN)ポート: `9`
   - 転送先IPアドレス: **LANのブロードキャストアドレス**(例: ルーターのIPが`192.168.1.1`なら`192.168.1.255`)
   - ★転送先に「ブロードキャストアドレス」を指定できることが重要です。1台のIPアドレスしか指定できないルーターの場合、PCが完全にOFFの状態ではARP解決ができず届きません。
4. **DDNSを設定する**: 自宅回線のIPアドレスは時間とともに変わる(動的IP)ことが多いため、固定のホスト名でアクセスできるようにします。
   - ルーターに「DDNS」設定があれば、対応サービス(No-IP、DynDNSなど)を登録してそのまま使う
   - ルーターにDDNS機能がなければ、無料の [DuckDNS](https://www.duckdns.org/) などを利用する
   - 取得したホスト名を`WOL_TARGET_HOST`として使う
5. **設定後の確認**: PCの電源を切った状態で、自宅の Wi-Fi を使わない回線(スマホのモバイルデータ通信など)から、設定したDDNSホスト名宛にWOLパケットを送るアプリ(スマホの「Wake On Lan」系アプリなど)で起動できるか確認してください。これが成功すれば、Botからも同じ仕組みで起動できます。

**ブロードキャスト転送に対応していない場合**: ルーターがブロードキャスト宛の転送に対応していない場合、次のような代替案があります。
- OpenWrt等の代替ファームウェアに対応したルーターに交換する
- 常時通電する中継デバイス(Raspberry Piなど)をLAN内に置き、Botからはその中継デバイスに指示を送って、ローカルから直接WOLブロードキャストを送ってもらう(ルーターの制約を回避できる)

### 4. Minecraftサーバーのserver.propertiesでRCONを有効にする

```properties
enable-rcon=true
rcon.port=25575
rcon.password=ここに任意の強いパスワードを設定
```

設定後、サーバーを再起動してください。

### 5. Botを Render にデプロイする

1. このリポジトリの `bot/` フォルダをGitHubにpush
2. [Render](https://render.com/) で「New > Web Service」を作成し、そのリポジトリ(`bot/`がルート、またはRoot Directoryを`bot`に指定)を選択
3. Build Command: `npm install` / Start Command: `npm start`
4. Environment(環境変数)に `bot/.env.example` の内容を参考にして実際の値を設定する
5. デプロイ完了後に発行されるURL(例: `https://your-app.onrender.com`)を覚えておく

### 6. GASでBotの常時起動を維持する(Practice-Scheduleと同じ方式)

1. [Google Apps Script](https://script.google.com/) で新規プロジェクトを作成
2. `gas/keep_alive.gs` の内容を貼り付け、`url` をRenderのURLに変更
3. `setupTrigger` 関数を1回実行(初回は権限の許可が必要)→ 5分おきに`keepAlive`が走るトリガーが作成される

### 7. ローカルエージェントをPCにセットアップする

1. [Node.js](https://nodejs.org/) をPCにインストール
2. `agent/` フォルダをPC内の任意の場所に配置
3. `agent/.env.example` を `.env` にコピーし、内容を設定(`AGENT_TOKEN`はbot側と必ず同じ値にする)
4. `agent/` フォルダで `npm install` を実行
5. 動作確認: `npm start` で起動し、ログに「Botに接続しました」と表示されるか確認
6. PC起動時に自動でエージェントが立ち上がるように、`register_task.bat` を**管理者権限で**実行してWindowsのタスクスケジューラに登録する

### 8. 動作確認

1. Discordのチャンネルに操作パネルが表示されているか確認
2. PCの電源を切った状態で「PC起動」ボタンを押す → PCが起動するか確認
3. PC起動・エージェント起動後、もう一度ボタン(ラベルが「サーバー起動」に変わっているはず)を押す → Minecraftサーバーが起動するか確認
4. サーバー起動後、「サーバー停止 & PC電源OFF」ボタンが押せるようになるか確認 → 押してサーバーが安全に停止しPCの電源が落ちるか確認

## 既知の制約・トラブルシューティング

- ルーターがブロードキャスト転送に対応していない場合、PCが完全OFFの状態からの起動はできません(上記「ルーターを設定する」の代替案を参照)
- タスクスケジューラ登録後にエージェントが起動しない場合、SYSTEM権限から`node`コマンドが見つからない可能性があります。`agent/run_agent.bat`内の`node`の部分を、コマンドプロンプトで`where node`を実行して表示されるフルパスに書き換えてください
- Renderの無料プランはディスクが再起動で消えるため、エージェント側の状態(`.env`含む)はあくまでPC側に保持する設計にしています
