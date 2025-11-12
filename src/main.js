import { OSZParser } from './oszParser.js';
import { BeatmapParser } from './beatmapParser.js';
import { AudioManager } from './audioManager.js';
import { GameRenderer } from './gameRenderer.js';

class Game {
    constructor() {
        this.oszParser = new OSZParser();
        this.beatmapParser = new BeatmapParser();
        this.audioManager = new AudioManager();
        this.renderer = null;
        this.audioManager.onEnded = () => {
            console.log("音乐播放结束");
            this.stop();
            this.isend = true;
            this.stats = {
                score: 0, combo: 0, acc: 100, totalHits: 0, weightedHits: 0,
                judgements: { Perfect: 0, Great: 0, Good: 0, Bad: 0, Miss: 0 }
            };
            GameRenderer.hitEffects = null;
            // 清空列物件缓存（如果需要完全回收）
            this.columns = [[], [], [], []];
            this.stop();
        }
        this.beatmaps = [];
        this.currentBeatmap = null;
        this.isend = true;
        // 判定与输入
        this.keyMap = ['d', 'f', 'j', 'k'];     // 默认键位
        this.pressed = new Set();
        this.columns = [[], [], [], []];        // 每列的物件列表（按时间）
        this.nextIndex = [0, 0, 0, 0];          // 每列下一个待判定的索引
        this.holdingLN = [null, null, null, null]; // 正在持有的LN对象

        // 判定窗口（ms）
        this.windows = {
            perfect: 22,
            great: 46,
            good: 86,
            bad: 136,
            miss: 180
        };

        // 统计
        this.stats = {
            score: 0,
            combo: 0,
            acc: 100,
            totalHits: 0,
            weightedHits: 0,
            judgements: { Perfect: 0, Great: 0, Good: 0, Bad: 0, Miss: 0 }
        };

        this.animationId = null;
        this.init();
        this.hitsound = new Audio('res/Enda.wav');
        this.hitsound.volume = 1;
        this.dosound = new Audio('res/Okar.wav');
        this.dosound.volume = 0.7;
        this.isAuto=false;
        this.getAutos();
        this.isntPaused = false;

    }
    getAutos(){
        if (this.isAuto){
            this.windows = {
                perfect : 1,
                great : 2,
                good : 3,
                bad : 4,
                miss : 5,
                max_window : 1
            };
        } else{
            this.windows = {
                perfect : 22,
                great : 46,
                good : 86,
                bad : 136,
                miss : 180,
                max_window : 179
            };
        }


    }
    init() {
        const canvas = document.getElementById('gameCanvas');
        this.renderer = new GameRenderer(canvas);
        this.bindEvents();
        this.getAutos();
    }

    bindEvents() {
        document.getElementById('oszFile').addEventListener('change', (e) => this.loadFile(e.target.files[0]));
        document.getElementById('difficultySelect').addEventListener('change', (e) => {
            const index = parseInt(e.target.value);
            if (!isNaN(index)) this.selectDifficulty(index);
        });

        document.getElementById('playBtn').addEventListener('click', () => this.play(true));
        document.getElementById('pauseBtn').addEventListener('click', () => this.pause());
        document.getElementById('stopBtn').addEventListener('click', () => this.stop());

        document.getElementById('speedSlider').addEventListener('input', (e) => {
            const speed = parseFloat(e.target.value);
            document.getElementById('speedValue').textContent = speed.toFixed(1) + 'x';
            this.audioManager.setPlaybackRate(speed);
        });
        document.getElementById('showSV').addEventListener('change', (e) => this.renderer.setShowSV(e.target.checked));
        document.getElementById('showKeyGroup').addEventListener('change', (e) => this.renderer.setShowKeyGroup(e.target.checked));
        document.getElementById('scrollSpeed').addEventListener('input', (e) => {
            const speed = parseFloat(e.target.value);
            document.getElementById('scrollSpeedValue').textContent = speed;
            this.renderer.setScrollSpeed(speed);
        });

        // 键盘输入
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
        document.getElementById('autoPlayBtn').addEventListener('change', (e) => {
            this.isAuto = e.target.checked; // 赋值
            console.log(this.isAuto);       // 打印当前状态
            this.getAutos();
        });
        let escPressTimer = null;
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // 如果已经在计时，不再重复
                if (escPressTimer) return;
                // 开始计时
                escPressTimer = setTimeout(() => {
                    this.togglePause(); // 按住一秒触发暂停/恢复
                    escPressTimer = null; // 清除计时器引用
                }, 1000); // 长按 1000 ms
            }
        });
        window.addEventListener('keyup', (e) => {
            if (e.key === 'Escape') {
                // 取消长按触发
                if (escPressTimer) {
                    clearTimeout(escPressTimer);
                    escPressTimer = null;
                }
            }
        });
    }
    togglePause() {
        if (!this.currentBeatmap) return;

        if (this.isntPaused) {
            this.pause();
        } else {
            // 恢复播放前清空按键状态，避免 ESC 残留触发判定
            this.pressed.clear();
            this.renderer.setPressedLanes(this.pressed);

            this.play(this.isend);
        }
    }

    keyToColumn(key) {
        const k = key.toLowerCase();
        return this.keyMap.indexOf(k);
    }

    onKeyDown(e) {
        const col = this.keyToColumn(e.key);
        if (col === -1) return;

        if (!this.pressed.has(col)) {
            this.pressed.add(col);
            this.renderer.setPressedLanes(this.pressed);
            this.tryJudgeOnPress(col);
            this.play_hit();
        }
        e.preventDefault();
    }

    onKeyUp(e) {
        const col = this.keyToColumn(e.key);
        if (col === -1) return;

        if (this.pressed.has(col)) {
            this.pressed.delete(col);
            this.renderer.setPressedLanes(this.pressed);
            this.tryJudgeOnRelease(col);
        }
        e.preventDefault();
    }

    tryJudgeOnPress(col) {
        const t = this.audioManager.getCurrentTime(); // ms
        const list = this.columns[col];
        let idx = this.nextIndex[col];

        // 跳过已经过了miss时间的物件
        while (idx < list.length && (list[idx].time < t - this.windows.miss)) {
            // 普通note过期或LN头过期 -> Miss
            const obj = list[idx];
            if (!obj.judgedHead) {
                this.applyJudgement('Miss', obj, col, true);
                obj.judgedHead = true;
            }
            idx++;
        }
        this.nextIndex[col] = idx;

        if (idx >= list.length) return;

        const obj = list[idx];

        if (!obj.isLongNote) {
            const diff = Math.abs(obj.time - t);
            const result = this.getJudgement(diff);
            if (result) {
                this.applyJudgement(result, obj, col, true);
                obj.judgedHead = true;
                this.nextIndex[col]++;
            }
        } else {
            // LN头判定
            if (!obj.judgedHead) {
                const diff = Math.abs(obj.time - t);
                const result = this.getJudgement(diff);
                if (result) {
                    this.applyJudgement(result, obj, col, true);
                    obj.judgedHead = true;
                    this.holdingLN[col] = obj; // 开始持有
                    // LN仍停留在列表里，等待尾判定
                }
            }
        }
    }

    tryJudgeOnRelease(col) {
        const t = this.audioManager.getCurrentTime();
        const obj = this.holdingLN[col];
        if (!obj) return;

        // LN尾判定
        const diff = Math.abs(obj.endTime - t);
        const result = this.getJudgement(diff);
        if (result) {
            this.applyJudgement(result, obj, col, false);
        } else {
            // 尾部未在窗口，视为Miss
            this.applyJudgement('Miss', obj, col, false);
        }

        // 完成LN判定后推进索引到下一个
        // 当前nextIndex可能仍指向该LN（如果头部时未推进），推进到下一个未判定的
        const list = this.columns[col];
        while (this.nextIndex[col] < list.length && list[this.nextIndex[col]] === obj) {
            this.nextIndex[col]++;
        }
        this.holdingLN[col] = null;
    }

    getJudgement(diffMs) {
        if (diffMs <= this.windows.perfect) return 'Perfect';
        if (diffMs <= this.windows.great) return 'Great';
        if (diffMs <= this.windows.good) return 'Good';
        if (diffMs <= this.windows.bad) return 'Bad';
        if (diffMs <= this.windows.miss) return 'Miss';
        return null;
    }

    applyJudgement(j, obj, col, isHead) {
        // 统计
        const weight = { Perfect: 1.0, Great: 0.9, Good: 0.7, Bad: 0.4, Miss: 0.0 }[j];
        const scoreAdd = { Perfect: 300, Great: 200, Good: 100, Bad: 50, Miss: 0 }[j];

        if (j === 'Miss') {
            this.stats.combo = 0;
        } else {
            this.stats.combo += 1;
            this.stats.score += scoreAdd + Math.floor(this.stats.combo * 0.5);
        }

        this.stats.totalHits += 1;
        this.stats.weightedHits += weight;
        this.stats.acc = (this.stats.weightedHits / this.stats.totalHits) * 100;
        this.stats.judgements[j] = (this.stats.judgements[j] || 0) + 1;

        // 标记物件判定
        if (obj.isLongNote) {
            if (isHead) obj.judgedHead = true;
            else obj.judgedTail = true;
        } else {
            obj.judgedHead = true;
        }

        // 触发打击特效
        let color = '#FFFFFF'; // 默认颜色
        if (this.renderer.showKeyGroup) {
            // j 是 'Great' 时才取对应的颜色,'Perfect' 时加一层金色判定
            if (j !== 'Miss') {
                if (j === 'Bad') {
                    color = '#afaeae';
                }else if(j === 'Great') {
                    color = '#7ecca7';
                } else {
                    const colors = this.renderer.keyGroupColors;
                    const index = obj.keyGroup % colors.length;
                    color = colors[index];
                    if (j === 'Perfect') {
                        this.renderer.createHitEffect(col,'#eade57');
                    }
                }
            }
            this.Okar_hit();
        }
        this.renderer.createHitEffect(col,color);

        // 更新渲染器统计显示
        this.renderer.setStats(this.stats);
    }
    play_hit(){
        const hit = this.hitsound.cloneNode();
        hit.play();
    }
    Okar_hit(){
        const hit = this.dosound.cloneNode();
        hit.play();
    }
    async loadFile(file) {
        if (!file) return;
        try {
            const ext = file.name.split('.').pop().toLowerCase();
            let files;
            if (ext === 'osz') files = await this.oszParser.loadOSZ(file);
            else if (ext === 'osu') files = await this.oszParser.loadSingleOSU(file);
            else { alert('不支持的文件格式'); return; }

            this.beatmaps = [];
            if (files.beatmaps) {
                for (const bmData of files.beatmaps) {
                    const beatmap = this.beatmapParser.parse(bmData.content);
                    this.beatmaps.push({ filename: bmData.filename, data: beatmap });
                }
            }

            const select = document.getElementById('difficultySelect');
            select.innerHTML = '<option value="">选择难度</option>';
            this.beatmaps.forEach((bm, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = bm.data.metadata.Version || `Difficulty ${index + 1}`;
                select.appendChild(option);
            });
            select.disabled = false;

            if (files.audio) {
                await this.audioManager.loadAudio(files.audio.blob);
                document.getElementById('totalTime').textContent =
                    this.formatTime(this.audioManager.getDuration());
            }

            if (this.beatmaps.length > 0) {
                select.value = '0';
                this.selectDifficulty(0);
            }

            // 加载背景图
            if (files.background) {
                try {
                    await this.renderer.setBackgroundImageBlob(files.background.blob);
                } catch (e) {
                    console.warn('背景加载失败', e);
                }
            }
            const target = document.getElementById('gameCanvas'); // 你要滚动到的div
            if (target) {
                target.scrollIntoView({behavior: 'smooth'}); // 平滑滚动
            }

        } catch (e) {
            console.error('加载失败', e);
            alert('加载失败: ' + e.message);
        }

    }

    selectDifficulty(index) {
        this.currentBeatmap = this.beatmaps[index].data;
        this.renderer.setBeatmap(this.currentBeatmap);

        // 列表按列分组
        this.columns = [[], [], [], []];
        for (const obj of this.currentBeatmap.hitObjects) {
            this.columns[obj.column].push(obj);
            obj.judgedHead = false;
            obj.judgedTail = false;
        }
        for (let c = 0; c < 4; c++) {
            this.columns[c].sort((a, b) => a.time - b.time);
            this.nextIndex[c] = 0;
            this.holdingLN[c] = null;
        }

        // 传递小节信息
        this.renderer.setBeatmap(this.currentBeatmap);

        // UI
        document.getElementById('songTitle').textContent =
            this.currentBeatmap.metadata.Title || '未知歌曲';
        document.getElementById('songArtist').textContent =
            'Artist: ' + (this.currentBeatmap.metadata.Artist || '未知');
        document.getElementById('songMapper').textContent =
            'Chart: ' + (this.currentBeatmap.metadata.Creator || '未知') +
            ' | Difficult: ' + (this.currentBeatmap.metadata.Version || '未知');

        // 重置统计
        this.stats = {
            score: 0, combo: 0, acc: 100, totalHits: 0, weightedHits: 0,
            judgements: { Perfect: 0, Great: 0, Good: 0, Bad: 0, Miss: 0 }
        };
        this.renderer.setStats(this.stats);

        document.getElementById('playBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = false;
        document.getElementById('stopBtn').disabled = false;

        this.renderer.render(0);
    }

    play(ev) {
        if (!this.currentBeatmap) return;

        // 如果已经在等待，就不重复触发
        if (this.waitingForStart) return;

        // 设置状态为等待按键
        this.waitingForStart = true;
        const overlay = document.getElementById('pauseOverlay');
        overlay.style.opacity = '0.8';
        overlay.innerHTML = '<div style="color:white;font-size:32px;text-align:center;margin-top:40vh;">Press Any Button...</div>';
        // 一次性按键监听
        const startHandler = (e) => {
            // ① 如果按的是 Esc，则不启动
            if (e.key === 'Escape') return;

            // ② 否则真的开始
            window.removeEventListener('keydown', startHandler);
            overlay.style.opacity = '0';
            overlay.innerHTML = '';
            this.waitingForStart = false;

            if (ev) {
                this.stats = {
                    score: 0, combo: 0, acc: 100, totalHits: 0, weightedHits: 0,
                    judgements: { Perfect: 0, Great: 0, Good: 0, Bad: 0, Miss: 0 }
                };
            }

            this.startGame();
            this.isend = false;
        };
        window.addEventListener('keydown', startHandler);

        window.addEventListener('keydown', startHandler);
    }
    startGame() {
        const settingsPanel = document.querySelector('.settings-panel');
        const playbackPanel = document.querySelector('.playback-controls');
        settingsPanel.classList.toggle('.settings-panel',false);
        playbackPanel.classList.toggle('.playback-controls',false);
        // 清空所有按键状态，防止恢复时有按键残留
        this.pressed.clear();
        this.renderer.setPressedLanes(this.pressed);

        const t = this.audioManager.getCurrentTime() / 1000;
        this.audioManager.play(t);
        this.startGameLoop();
        const overlay = document.getElementById('pauseOverlay');
        overlay.style.opacity = '0';
        this.isntPaused = true;
    }



    pause() {
        this.audioManager.pause();
        this.stopGameLoop();
        // 让遮罩层变暗
        const overlay = document.getElementById('pauseOverlay');
        overlay.style.opacity = '0.6'; // 暗化程度，可调整
        overlay.innerHTML = '<div style="color:white;font-size:50px;text-align:center;margin-top:40vh;">Pausing...</div>';
        const settingsPanel = document.querySelector('.settings-panel');
        const playbackPanel = document.querySelector('.playback-controls');
        settingsPanel.classList.toggle('active',true);
        playbackPanel.classList.toggle('active',true);
        this.isntPaused = false;
    }

    stop() {
        this.audioManager.stop();
        this.stopGameLoop();

        // 清画面（0 时刻）
        this.renderer.render(0);

        // 清状态
        this.pressed.clear();
        this.renderer.setPressedLanes(this.pressed);

        this.holdingLN = [null, null, null, null];
        this.nextIndex = [0, 0, 0, 0];

        // 重置 hit 状态
        if (this.currentBeatmap?.hitObjects) {
            for (const obj of this.currentBeatmap.hitObjects) {
                obj.judgedHead = false;
                obj.judgedTail = false;
            }
        }

        // 重置统计并立即应用到渲染器
        this.stats = {
            score: 0, combo: 0, acc: 100,
            totalHits: 0, weightedHits: 0,
            judgements: { Perfect: 0, Great: 0, Good: 0, Bad: 0, Miss: 0 }
        };
        this.renderer.setStats(this.stats);
        this.renderer.render(0); // 立即更新HUD显示

        // 其它遮罩
        const overlay = document.getElementById('pauseOverlay');
        overlay.style.opacity = '0.6';
        this.isntPaused = false;
        this.isend = true;

        // 清 hitEffects
        this.renderer.hitEffects = [];
        GameRenderer.hitEffects = null;
    }


    startGameLoop() {
        const loop = () => {
            if (!this.audioManager.getIsPlaying()) return;
            const currentTime = this.audioManager.getCurrentTime(); // ms
            this.renderer.render(currentTime);

            const duration = this.audioManager.getDuration();
            const progress = (currentTime / 1000 / duration) * 100;
            document.getElementById('progressFill').style.width = progress + '%';
            document.getElementById('currentTime').textContent =
                this.formatTime(currentTime / 1000);

            // 自动Miss：对于已过miss窗口但未判定的普通note/ln头，给Miss并推进索引
            for (let c = 0; c < 4; c++) {
                const list = this.columns[c];
                while (this.nextIndex[c] < list.length) {
                    const obj = list[this.nextIndex[c]];
                    const deadline = obj.isLongNote ? obj.time : obj.time;
                    if (deadline < currentTime - this.windows.miss && !obj.judgedHead) {
                        this.applyJudgement(this.isAuto?'Perfect':'Miss', obj, c, true);
                        obj.judgedHead = true;
                        // 普通note直接推进，LN保留等待尾（尾部仍会Miss）
                        if (!obj.isLongNote) this.nextIndex[c]++;
                        else {
                            // 若用户没有按住LN，到尾部也会Miss；这里不推进索引，等尾部Miss后推进
                        }
                    } else {
                        break;
                    }
                }

                // LN尾自动Miss：如果尾部过了miss窗口
                const holdObj = this.holdingLN[c];
                if (!holdObj) {
                    // 如果有LN在列表中，但已经过了尾部miss时限，且尚未判定尾
                    const idx = this.nextIndex[c];
                    if (idx < list.length) {
                        const obj = list[idx];
                        if (obj.isLongNote && obj.judgedHead && !obj.judgedTail) {
                            if (obj.endTime < currentTime - this.windows.max_window) {
                                this.applyJudgement(this.isAuto?'Perfect':'Miss', obj, c, false);
                                obj.judgedTail = true;
                                this.nextIndex[c]++;
                            }
                        }
                    }
                }
            }

            this.animationId = requestAnimationFrame(loop);
        };
        this.animationId = requestAnimationFrame(loop);
    }

    stopGameLoop() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.animationId = null;
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
