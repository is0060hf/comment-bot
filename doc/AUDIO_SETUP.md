# 仮想オーディオデバイス設定ガイド

このガイドでは、Comment Botで配信音声をキャプチャするための仮想オーディオデバイスの設定方法を説明します。

## 必要な仮想オーディオデバイス

以下のいずれかをインストールしてください：

1. **BlackHole 2ch**（推奨・無料）
2. **Loopback**（有料・高機能）

## BlackHole 2chのセットアップ

### 1. インストール

1. [BlackHole公式サイト](https://existential.audio/blackhole/)にアクセス
2. BlackHole 2chをダウンロード
3. インストーラーを実行

### 2. macOSでの設定

#### Audio MIDI設定

1. `アプリケーション` > `ユーティリティ` > `Audio MIDI設定`を開く
2. 左下の`+`ボタンをクリック
3. `複数出力装置を作成`を選択
4. 以下のデバイスをチェック：
   - BlackHole 2ch
   - 内蔵スピーカー（または使用中の出力デバイス）
5. マスター装置を`内蔵スピーカー`に設定

#### システム環境設定

1. `システム環境設定` > `サウンド`を開く
2. `出力`タブで作成した`複数出力装置`を選択

### 3. 配信ソフトでの設定

#### OBS Studio

1. `設定` > `音声`を開く
2. `デスクトップ音声`を`BlackHole 2ch`に設定
3. `マイク音声`は通常のマイクを選択

#### YouTube Studio

1. 配信設定でマイクを選択
2. システム音声は自動的にキャプチャされます

### 4. Comment Botでの設定

`config/local.yaml`を編集：

```yaml
audio:
  device: "BlackHole 2ch"
  sampleRate: 48000
  channels: 2
  bufferSize: 512
```

## Loopbackのセットアップ

### 1. インストール

1. [Rogue Amoeba](https://rogueamoeba.com/loopback/)から購入・ダウンロード
2. インストーラーを実行
3. ライセンスキーを入力

### 2. 仮想デバイスの作成

1. Loopbackを起動
2. `New Virtual Device`をクリック
3. 名前を`Comment Bot Audio`に設定
4. ソースを追加：
   - System Audio
   - 使用するアプリケーション（ブラウザなど）

### 3. Comment Botでの設定

```yaml
audio:
  device: "Comment Bot Audio"
  sampleRate: 48000
  channels: 2
  bufferSize: 256  # Loopbackは低レイテンシ可能
```

## トラブルシューティング

### 音声がキャプチャされない

1. **デバイスの確認**
   ```bash
   # 利用可能なオーディオデバイスを表示
   npm run list-audio-devices
   ```

2. **権限の確認**
   - `システム環境設定` > `セキュリティとプライバシー` > `プライバシー`
   - `マイク`でターミナルまたはVS Codeにチェック

3. **サンプルレートの調整**
   ```yaml
   audio:
     sampleRate: 44100  # 48000から変更してみる
   ```

### 音声が遅延する

1. **バッファサイズの調整**
   ```yaml
   audio:
     bufferSize: 256  # 小さくすると低遅延
   ```

2. **プロセス優先度の設定**
   ```bash
   # 高優先度で実行
   nice -n -10 npm run start:agent
   ```

### 音声が途切れる

1. **CPU使用率の確認**
   - アクティビティモニタで確認
   - 他の重いアプリケーションを終了

2. **バッファサイズを増やす**
   ```yaml
   audio:
     bufferSize: 1024  # 安定性重視
   ```

## 推奨設定

### 低遅延重視

```yaml
audio:
  device: "Loopback"  # または "BlackHole 2ch"
  sampleRate: 48000
  channels: 2
  bufferSize: 256
  latencyHint: "interactive"
```

### 安定性重視

```yaml
audio:
  device: "BlackHole 2ch"
  sampleRate: 44100
  channels: 2
  bufferSize: 1024
  latencyHint: "balanced"
```

### 省電力重視

```yaml
audio:
  device: "BlackHole 2ch"
  sampleRate: 16000
  channels: 1
  bufferSize: 2048
  latencyHint: "playback"
```

## 配信ソフトとの連携

### OBS Studioの推奨設定

- **音声ビットレート**: 128 kbps以上
- **サンプルレート**: 48 kHz
- **チャンネル**: ステレオ

### 音声ミキサーの活用

複雑な音声ルーティングが必要な場合：

1. **LadioCast**（無料）
   - 複数の入出力を柔軟にルーティング
   - エフェクトの適用も可能

2. **Audio Hijack**（有料）
   - ビジュアルなルーティング設定
   - 録音機能付き

## パフォーマンスの最適化

### CPU使用率を下げる

1. **モノラルに変更**
   ```yaml
   audio:
     channels: 1
   ```

2. **サンプルレートを下げる**
   ```yaml
   audio:
     sampleRate: 16000  # 音声認識には十分
   ```

### メモリ使用量を減らす

1. **リングバッファサイズの調整**
   ```yaml
   audio:
     ringBufferSize: 10  # 秒数
   ```

2. **不要な処理を無効化**
   ```yaml
   audio:
     enableNoiseSuppression: false
     enableEchoCancellation: false
   ```

## まとめ

適切な仮想オーディオデバイスの設定により、Comment Botは配信音声を確実にキャプチャし、リアルタイムでの文字起こしとコメント生成が可能になります。

設定で問題が発生した場合は、以下を確認してください：

1. オーディオデバイスが正しくインストールされているか
2. 必要な権限が付与されているか
3. 設定ファイルのデバイス名が正しいか
4. サンプルレートとバッファサイズが適切か

それでも解決しない場合は、[Issues](https://github.com/your-username/comment-bot/issues)で報告してください。
