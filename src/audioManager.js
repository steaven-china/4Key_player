// 优化的音频管理器 - 支持音效池和异步加载
export class AudioManager {
    constructor() {
        this.audio = null;
        this.audioContext = null;
        this.sourceNode = null;
        this.onEnded = null;
        this.isPlaying = false;
        this.startTime = 0;
        this.pauseTime = 0;
        this.playbackRate = 1.0;

        // 音效池
        this.soundPool = new Map();
        this.poolSize = 10;
        this.initAudioContext();
    }

    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported', e);
        }
    }

    async loadAudio(audioBlob) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(audioBlob);
            this.audio = new Audio(url);
            this.audio.volume = 0.26;

            this.audio.addEventListener('loadeddata', () => {
                resolve(this.audio);
            });

            this.audio.addEventListener('error', reject);
        });
    }

    // 异步加载音效到池中
    async loadSound(name, url) {
        if (!this.audioContext) return;

        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            this.soundPool.set(name, {
                buffer: audioBuffer,
                instances: []
            });

            console.log(`Sound "${name}" loaded successfully`);
        } catch (e) {
            console.error(`Failed to load sound "${name}":`, e);
        }
    }

    // 异步播放音效（使用对象池）
    async playSound(name, volume = 1.0) {
        if (!this.audioContext || !this.soundPool.has(name)) {
            return;
        }

        // 确保 AudioContext 已启动
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        const soundData = this.soundPool.get(name);

        // 使用 Promise 包装播放逻辑，实现真正的异步
        return new Promise((resolve) => {
            // 使用 setTimeout 将音效播放推到下一个事件循环
            setTimeout(() => {
                const source = this.audioContext.createBufferSource();
                source.buffer = soundData.buffer;

                const gainNode = this.audioContext.createGain();
                gainNode.gain.value = volume;

                source.connect(gainNode);
                gainNode.connect(this.audioContext.destination);

                source.onended = () => {
                    source.disconnect();
                    gainNode.disconnect();
                    resolve();
                };

                source.start(0);
            }, 0);
        });
    }

    // 批量异步播放（不等待完成）
    playSound_nonBlocking(name, volume = 1.0) {
        this.playSound(name, volume).catch(e => {
            console.warn(`Sound playback error: ${e}`);
        });
    }

    play(startTime = 0) {
        if (this.audio) {
            this.audio.currentTime = startTime;
            this.audio.playbackRate = this.playbackRate;
            this.audio.play();
            this.isPlaying = true;
            this.startTime = startTime;
            this.audio.onended = () => {
                this.isPlaying = false;
                if (this.onEnded) this.onEnded();
            };
        }
    }

    pause() {
        if (this.audio) {
            this.audio.pause();
            this.pauseTime = this.audio.currentTime;
            this.isPlaying = false;
        }
    }

    stop() {
        if (this.audio) {
            this.audio.pause();
            this.audio.currentTime = 0;
            this.isPlaying = false;
            this.pauseTime = 0;
        }
    }

    setPlaybackRate(rate) {
        this.playbackRate = rate;
        if (this.audio) {
            this.audio.playbackRate = rate;
        }
    }

    getCurrentTime() {
        return this.audio ? this.audio.currentTime * 1000 : 0;
    }

    getDuration() {
        return this.audio ? this.audio.duration : 0;
    }

    getIsPlaying() {
        return this.isPlaying;
    }

    // 清理资源
    dispose() {
        this.soundPool.clear();
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}
