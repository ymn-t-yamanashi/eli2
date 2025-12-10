// VOICEVOX EngineのURL
const VOICEVOX_URL = "http://localhost:50021"; 

Voicex = {
    // ⚠️ 新しい状態変数
    // 現在再生中の <audio> 要素を保持します。
    currentAudioPlayer: null,
    // Blob URLを保持し、再生停止または終了時に解放（revoke）するために使用します。
    currentAudioUrl: null, 

    // ライフサイクルコールバック (要素がDOMに追加され、LiveViewと接続された時に実行)
    mounted() {
        // Elixirサーバー側から送信されるイベントをリッスン
        // イベント名: "synthesize_and_play" (音声合成と再生の開始)
        this.handleEvent("synthesize_and_play", ({ text, speaker_id }) => {
            // 新しい再生が開始される前に、もし再生中であれば停止します。
            this.stopPlayback(); 
            this.speakText(text, speaker_id);
        });

        // 停止イベントのハンドラ（LiveViewから明示的に停止を指示する場合）
        // LiveView側で `push_event("stop_voice_playback", %{})` のように呼び出せます。
        this.handleEvent("stop_voice_playback", () => {
            this.stopPlayback();
        });
    },

    // --- 1. VOICEVOX API通信関数 (Hook内部関数として定義) ---

    /**
     * 1. VOICEVOX APIを使って音声合成クエリを取得します (audio_query)。
     */
    async fetchAudioQuery(text, speakerId) {
        const queryParams = new URLSearchParams({ text: text, speaker: speakerId });
        const queryUrl = `${VOICEVOX_URL}/audio_query?${queryParams}`;

        const queryResponse = await fetch(queryUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!queryResponse.ok) {
            throw new Error(`audio_query failed with status ${queryResponse.status}`);
        }
        return await queryResponse.json();
    },

    /**
     * 2. VOICEVOX APIを使って音声合成を実行し、WAV形式のBlobを取得します (synthesis)。
     */
    async fetchSynthesis(audioQuery, speakerId) {
        const synthesisParams = new URLSearchParams({ speaker: speakerId });
        const synthesisUrl = `${VOICEVOX_URL}/synthesis?${synthesisParams}`;

        const synthesisResponse = await fetch(synthesisUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(audioQuery)
        });

        if (!synthesisResponse.ok) {
            throw new Error(`synthesis failed with status ${synthesisResponse.status}`);
        }
        return await synthesisResponse.blob();
    },

    // --- 2. コアロジック関数 (Hook内部関数として定義) ---

    /**
     * VOICEVOX APIを使って音声データ(Blob)を取得する純粋なロジック関数。
     */
    async synthesizeTextToBlob(text, speakerId) {
        const trimmedText = text.trim();
        if (!trimmedText) {
            throw new Error("Text input is empty."); 
        }

        // 1. クエリ取得 (Hook内部関数を呼び出し)
        const audioQuery = await this.fetchAudioQuery(trimmedText, speakerId);

        audioQuery.speedScale = 1.5;
        
        // 2. 音声合成 (Hook内部関数を呼び出し)
        const wavBlob = await this.fetchSynthesis(audioQuery, speakerId);

        return wavBlob;
    },

    // --- 3. メインアプリケーション関数 (Hookの主要ロジック) ---

    /**
     * 音声合成と再生を実行するメイン関数。
     */
    async speakText(text, speakerId) {
        try {
            // 1. コアロジックを呼び出し、Blobを取得 (Hook内部関数を呼び出し)
            const wavBlob = await this.synthesizeTextToBlob(text, speakerId);
            
            // 2. JavaScript側で <audio> 要素を生成
            const audioPlayer = new Audio();
            
            // 3. 再生ロジック
            const audioUrl = URL.createObjectURL(wavBlob);
            audioPlayer.src = audioUrl;

            // 状態を更新
            this.currentAudioPlayer = audioPlayer; 
            this.currentAudioUrl = audioUrl;

            // 4. 再生開始
            // ブラウザの自動再生ポリシーにより、ユーザー操作がないと失敗する場合があります
            await audioPlayer.play();

            // 5. 再生終了/エラー後のクリーンアップ関数を定義
            const cleanup = () => {
                // 再生が終了したものが、現在のプレイヤーであることを確認
                if (this.currentAudioPlayer === audioPlayer) {
                    URL.revokeObjectURL(audioUrl); // リソース解放
                    this.currentAudioPlayer = null; // 状態クリア
                    this.currentAudioUrl = null;
                    this.pushEvent("voice_playback_finished", { status: "ok" });
                }
            };
            
            // 再生終了時とエラー時のクリーンアップを設定
            audioPlayer.onended = cleanup;
            audioPlayer.onerror = cleanup; 

        } catch (error) {
            console.error("致命的なエラーが発生しました:", error.message, error);
            
            // エラーロギング
            if (error.message.includes("Text input is empty")) {
                console.error("エラー: テキストが入力されていません。");
            } else if (error.name === "NotAllowedError") {
                console.warn("警告: 再生がブラウザによってブロックされました (ユーザー操作が必要な場合があります)。");
            } else {
                console.error(`VOICEVOX Engine 接続エラー: ポート (${VOICEVOX_URL}) を確認してください。`);
            }
            
            // エラーが発生した場合も、状態をクリアしておきます
            this.currentAudioPlayer = null;
            this.currentAudioUrl = null;
        } 
    },
    
    // --- 4. 停止機能 (新しく追加された関数) ---

    /**
     * 現在再生中の音声を停止し、関連リソースを解放します。
     */
    stopPlayback() {
        if (this.currentAudioPlayer) {
            this.currentAudioPlayer.pause(); // 再生を一時停止（停止）
            this.currentAudioPlayer.currentTime = 0; // 再生位置をリセット

            // 状態とリソースの解放
            if (this.currentAudioUrl) {
                URL.revokeObjectURL(this.currentAudioUrl); // Blob URLを解放
            }

            // 状態をクリア
            this.currentAudioPlayer = null;
            this.currentAudioUrl = null;
            
            console.log("音声再生を停止しました。");
            return true;
        }
        // console.log("再生中の音声はありませんでした。"); // 頻繁にログが出力されるのを避けるためコメントアウト
        return false;
    }
};

export default Voicex