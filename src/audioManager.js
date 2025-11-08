// 音频管理器
export class AudioManager {
    constructor() {
        this.audio = null;
        this.audioContext = null;
        this.sourceNode = null;
        this.isPlaying = false;
        this.startTime = 0;
        this.pauseTime = 0;
        this.playbackRate = 1.0;
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

    play(startTime = 0) {
        if (this.audio) {
            this.audio.currentTime = startTime;
            this.audio.playbackRate = this.playbackRate;
            this.audio.play();
            this.isPlaying = true;
            this.startTime = startTime;
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
}
