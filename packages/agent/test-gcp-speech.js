// GCP Speech-to-Text 接続テスト
require('dotenv').config();
const speech = require('@google-cloud/speech');

async function testConnection() {
  try {
    const client = new speech.SpeechClient({
      keyFilename: process.env.GCP_SPEECH_CREDENTIALS_PATH,
    });

    console.log('✅ GCP Speech-to-Text クライアントの初期化に成功しました');
    console.log('認証情報パス:', process.env.GCP_SPEECH_CREDENTIALS_PATH);

    // プロジェクトIDの取得（接続確認）
    const [result] = await client.getProjectId();
    console.log('プロジェクトID:', result);
  } catch (error) {
    console.error('❌ エラー:', error.message);
  }
}

testConnection();
