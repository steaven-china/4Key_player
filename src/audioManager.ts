// 优化的音频管理器 - 支持音效池和异步加载

type SoundData = {
    buffer: AudioBuffer;
    instances: AudioBufferSourceNode[];
};

export class AudioManager {
    private audio: HTMLAudioElement | null = null;
    private audioContext: AudioContext | null = null;
    private sourceNode: AudioBufferSourceNode | null = null;
    public onEnded: (() => void) | null = null;
    private isPlaying: boolean = false;
    private startTime: number = 0;
    private pauseTime: number = 0;
    private playbackRate: number = 1.0;

    // 音效池
    private soundPool: Map<string, SoundData> = new Map();
    private readonly poolSize: number = 10;

    constructor() {
        this.initAudioContext();
    }

    private initAudioContext(): void {
        try {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported', e);
        }
    }

    async loadAudio(audioBlob: Blob): Promise<HTMLAudioElement> {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(audioBlob);
            this.audio = new Audio(url);
            this.audio.volume = 0.26;

            this.audio.addEventListener('loadeddata', () => {
                resolve(this.audio!);
            });

            this.audio.addEventListener('error', reject);
        });
    }

    // 异步加载音效到池中
    async loadSound(name: string, url: string): Promise<void> {
        if (!this.audioContext) return;

        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            this.soundPool.set(name, {
                buffer: audioBuffer,
                instances: []
            });


        } catch (e) {
            console.error(`Failed to load sound "${name}":`, e);
        }
    }

    // 异步播放音效（使用对象池）
    async playSound(name: string, volume: number = 1.0): Promise<void> {
        if (!this.audioContext || !this.soundPool.has(name)) {
            return;
        }

        // 确保 AudioContext 已启动
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        const soundData = this.soundPool.get(name)!;

        // 使用 Promise 包装播放逻辑，实现真正的异步
        return new Promise((resolve) => {
            // 使用 setTimeout 将音效播放推到下一个事件循环
            setTimeout(() => {
                const source = this.audioContext!.createBufferSource();
                source.buffer = soundData.buffer;

                const gainNode = this.audioContext!.createGain();
                gainNode.gain.value = volume;

                source.connect(gainNode);
                gainNode.connect(this.audioContext!.destination);

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
    playSound_nonBlocking(name: string, volume: number = 1.0): void {
        this.playSound(name, volume).catch(e => {
            console.warn(`Sound playback error: ${e}`);
        });
    }

    play(startTime: number = 0): void {
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

    pause(): void {
        if (this.audio) {
            this.audio.pause();
            this.pauseTime = this.audio.currentTime;
            this.isPlaying = false;
        }
    }

    stop(): void {
        if (this.audio) {
            this.audio.pause();
            this.audio.currentTime = 0;
            this.isPlaying = false;
            this.pauseTime = 0;
        }
    }

    setPlaybackRate(rate: number): void {
        this.playbackRate = rate;
        if (this.audio) {
            this.audio.playbackRate = rate;
        }
    }

    getCurrentTime(): number {
        return this.audio ? this.audio.currentTime * 1000 : 0;
    }

    getDuration(): number {
        return this.audio ? this.audio.duration : 0;
    }

    getIsPlaying(): boolean {
        return this.isPlaying;
    }

    // 清理资源
    dispose(): void {
        this.soundPool.clear();
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}
