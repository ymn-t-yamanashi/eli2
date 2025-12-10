// VOICEVOX EngineのURL
const VOICEVOX_URL = "http://localhost:50021";

Voicex = {
    currentAudioPlayer: null,
    currentAudioUrl: null,

    // Web Audio API 用
    audioContext: null,
    analyser: null,
    volumeCheckId: null, // requestAnimationFrame の ID

    mounted() {
        this.handleEvent("synthesize_and_play", ({ text, speaker_id }) => {
            this.stopPlayback();
            this.speakText(text, speaker_id);
        });

        this.handleEvent("stop_voice_playback", () => {
            this.stopPlayback();
        });
    },

    async fetchAudioQuery(text, speakerId) {
        const queryParams = new URLSearchParams({ text, speaker: speakerId });
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

    async synthesizeTextToBlob(text, speakerId) {
        const trimmedText = text.trim();
        if (!trimmedText) throw new Error("Text input is empty.");

        const audioQuery = await this.fetchAudioQuery(trimmedText, speakerId);

        audioQuery.speedScale = 1.5;

        const wavBlob = await this.fetchSynthesis(audioQuery, speakerId);
        return wavBlob;
    },

    async speakText(text, speakerId) {
        try {
            const wavBlob = await this.synthesizeTextToBlob(text, speakerId);

            const audioPlayer = new Audio();
            const audioUrl = URL.createObjectURL(wavBlob);
            audioPlayer.src = audioUrl;

            this.currentAudioPlayer = audioPlayer;
            this.currentAudioUrl = audioUrl;

            // --- Web Audio API 初期化 ---
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const source = this.audioContext.createMediaElementSource(audioPlayer);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 512;

            source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);

            // --- ボリューム測定開始 ---
            this.startVolumeMonitor();

            await audioPlayer.play();

            const cleanup = () => {
                if (this.currentAudioPlayer === audioPlayer) {
                    this.stopVolumeMonitor();
                    URL.revokeObjectURL(audioUrl);
                    this.currentAudioPlayer = null;
                    this.currentAudioUrl = null;
                    this.pushEvent("voice_playback_finished", { status: "ok" });
                }
            };

            audioPlayer.onended = cleanup;
            audioPlayer.onerror = cleanup;

        } catch (error) {
            console.error("致命的なエラー:", error.message, error);

            this.stopVolumeMonitor();
            this.currentAudioPlayer = null;
            this.currentAudioUrl = null;
        }
    },

    // -------------------------------
    // 🔊 ボリューム測定ループ
    // -------------------------------
    startVolumeMonitor() {
        if (!this.analyser) return;

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const loop = () => {
            this.analyser.getByteTimeDomainData(dataArray);

            // RMSを計算
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                const v = (dataArray[i] - 128) / 128;
                sum += v * v;
            }
            const rms = Math.sqrt(sum / bufferLength);

            // 0〜1 の値で LiveView に送信
            this.pushEvent("voice_volume", { volume: rms });

            this.volumeCheckId = requestAnimationFrame(loop);
        };

        loop();
    },

    stopVolumeMonitor() {
        if (this.volumeCheckId) {
            cancelAnimationFrame(this.volumeCheckId);
            this.volumeCheckId = null;
        }
    },

    stopPlayback() {
        if (this.currentAudioPlayer) {
            this.currentAudioPlayer.pause();
            this.currentAudioPlayer.currentTime = 0;

            if (this.currentAudioUrl) {
                URL.revokeObjectURL(this.currentAudioUrl);
            }

            this.stopVolumeMonitor();

            this.currentAudioPlayer = null;
            this.currentAudioUrl = null;

            console.log("音声再生を停止しました。");
            return true;
        }
        return false;
    }
};

export default Voicex;
