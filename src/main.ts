import {OSZParser} from './oszParser.js';
import type {Beatmap, HitObject} from './beatmapParser.js';
import {BeatmapParser} from './beatmapParser.js';
import {AudioManager} from './audioManager.js';
import {GameRenderer} from './gameRenderer.js';

type JudgementType = 'Perfect' | 'Great' | 'Good' | 'Bad' | 'Miss';

class Game {
    private oszParser: OSZParser;
    private beatmapParser: BeatmapParser;
    private audioManager: AudioManager;
    private renderer: GameRenderer | null;
    private beatmaps: Array<{ filename: string; data: Beatmap }>;
    private currentBeatmap: Beatmap | null;
    private isend: boolean;
    private keyMap: string[];
    private pressed: Set<number>;
    private columns: HitObject[][];
    private nextIndex: number[];
    private holdingLN: (HitObject | null)[];
    private windows: {
        perfect: number;
        great: number;
        good: number;
        bad: number;
        miss: number;
        max_window: number;
    };
    private stats: {
        score: number;
        combo: number;
        acc: number;
        totalHits: number;
        weightedHits: number;
        judgements: Record<string, number>;
    };
    private animationId: number | null;
    private hitsound: HTMLAudioElement;
    private dosound: HTMLAudioElement;
    private isAuto: boolean;
    private isntPaused: boolean;
    private ShowScore: any;
    private waitingForStart: boolean;
    private progressFill: HTMLElement | null | undefined;
    private currentTimeElement: HTMLElement | null | undefined;
    private totalTimeElement: HTMLElement | null | undefined;
    private resultPanel: HTMLElement | null | undefined;
    private infoPanelElement: HTMLElement | null | undefined;
    private naturalEnd: boolean;

    constructor() {

        this.oszParser = new OSZParser();
        this.beatmapParser = new BeatmapParser();
        this.audioManager = new AudioManager();
        this.renderer = null;
        if (document.getElementById("progressFill")) {
            this.progressFill = document.getElementById("progressFill");
        }
        this.currentTimeElement = document.getElementById("currentTime");
        this.totalTimeElement = document.getElementById("totalTime");
        this.resultPanel = document.getElementById("resultPanel");
        this.infoPanelElement = document.querySelector(".info-panel") as HTMLElement | null;
        this.naturalEnd = false;

        this.audioManager.onEnded = () => {

            this.ShowScore = this.stats;
            this.isend = true;
            this.naturalEnd = true;
            this.stop();
            if (this.renderer) this.renderer.clearHitEffects();
            // 清空列物件缓存（如果需要完全回收）
            this.columns = [[], [], [], []];
            if (this.resultPanel) {
                // 从左侧向右展开效果
                this.resultPanel.style.position = 'absolute';
                this.resultPanel.style.top = '0';
                this.resultPanel.style.left = '0';
                this.resultPanel.style.width = '0';
                this.resultPanel.style.height = '100%';
                this.resultPanel.style.backgroundColor = '#ADD8E6'; // 浅蓝色
                this.resultPanel.style.transition = 'width 0.8s ease-in-out';
                this.resultPanel.style.zIndex = '9999';
                this.resultPanel.style.overflow = 'hidden';

                // 预先设置Chart信息的transition
                if (this.infoPanelElement) {
                    this.infoPanelElement.style.transition = 'all 0.8s ease-in-out';
                }

                // 触发动画
                setTimeout(() => {
                    this.resultPanel!.style.width = '40%';
                    // 同步Chart信息滑移至右侧
                    if (this.infoPanelElement) {
                        this.infoPanelElement.style.transform = 'translateX(40vw)';
                    }
                }, 100);
            }


            // 显示分数结果
            this.ToResult(this.stats);

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
            miss: 180,
            max_window: 179
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
        this.init().then(null);
        this.hitsound = new Audio('res/Enda.wav');
        this.hitsound.volume = 1;
        this.dosound = new Audio('res/Okar.wav');
        this.dosound.volume = 0.7;
        this.isAuto = false;
        this.getAutos();
        this.isntPaused = false;
        this.waitingForStart = false;

    }
    getAutos() {
        if (this.isAuto) {
            this.windows = {
                perfect: 30,
                great: 200,
                good: 300,
                bad: 400,
                miss: 500,
                max_window: 1
            };
        } else {
            this.windows = {
                perfect: 22,
                great: 46,
                good: 86,
                bad: 136,
                miss: 180,
                max_window: 179
            };
        }


    }

    // 保存当前设置到本地存储
    saveSettings(): void {
        const settings = {
            showSV: (document.getElementById('showSV') as HTMLInputElement).checked,
            showKeyGroup: (document.getElementById('showKeyGroup') as HTMLInputElement).checked,
            scrollSpeed: parseFloat((document.getElementById('scrollSpeed') as HTMLInputElement).value),
            autoPlay: (document.getElementById('autoPlayBtn') as HTMLInputElement).checked,
            speedSlider: parseFloat((document.getElementById('speedSlider') as HTMLInputElement).value),
            language: (document.getElementById('languageSelect') as HTMLSelectElement).value,
            disableVsync: (document.getElementById('disableVsync') as HTMLInputElement).checked
        };

        localStorage.setItem('gameSettings', JSON.stringify(settings));


        // 显示保存成功提示
        this.showToast('设置已保存！');
    }

    // 从本地存储加载设置
    loadSettings(): void {
        try {
            const saved = localStorage.getItem('gameSettings');
            if (!saved) {

                return;
            }

            const settings = JSON.parse(saved);


            // 恢复复选框状态
            (document.getElementById('showSV') as HTMLInputElement).checked = settings.showSV;
            (document.getElementById('showKeyGroup') as HTMLInputElement).checked = settings.showKeyGroup;
            (document.getElementById('autoPlayBtn') as HTMLInputElement).checked = settings.autoPlay;
            (document.getElementById('disableVsync') as HTMLInputElement).checked = settings.disableVsync || false;

            // 恢复滑块值
            (document.getElementById('scrollSpeed') as HTMLInputElement).value = settings.scrollSpeed.toString();
            (document.getElementById('speedSlider') as HTMLInputElement).value = settings.speedSlider.toString();

            // 恢复语言选择
            (document.getElementById('languageSelect') as HTMLSelectElement).value = settings.language;

            // 更新显示值
            document.getElementById('scrollSpeedValue')!.textContent = settings.scrollSpeed.toString();
            document.getElementById('speedValue')!.textContent = settings.speedSlider.toFixed(1) + 'x';

            // 应用设置到渲染器和游戏状态（检查renderer是否已初始化）
            if (this.renderer) {
                this.renderer.setShowSV(settings.showSV);
                this.renderer.setShowKeyGroup(settings.showKeyGroup);
                this.renderer.setScrollSpeed(settings.scrollSpeed);
                this.renderer.setDisableVsync(settings.disableVsync || false);
            }
            this.audioManager.setPlaybackRate(settings.speedSlider);
            this.isAuto = settings.autoPlay;
            this.getAutos();

            // 触发语言变更（如果i18next已初始化）
            const langSelect = document.getElementById('languageSelect') as HTMLSelectElement;
            if (langSelect.value !== settings.language) {
                langSelect.value = settings.language;
                langSelect.dispatchEvent(new Event('change'));
            }


            this.showToast('设置已加载！');
        } catch (error) {
            console.error('加载设置失败:', error);
            this.showToast('加载设置失败，使用默认设置');
        }
    }

    // 清除所有设置（重置为默认值）
    clearSettings(): void {
        if (!confirm('确定要清除所有设置吗？这将重置所有选项为默认值。')) {
            return;
        }

        // 重置为默认值
        (document.getElementById('showSV') as HTMLInputElement).checked = true;
        (document.getElementById('showKeyGroup') as HTMLInputElement).checked = true;
        (document.getElementById('scrollSpeed') as HTMLInputElement).value = '40';
        (document.getElementById('autoPlayBtn') as HTMLInputElement).checked = false;
        (document.getElementById('speedSlider') as HTMLInputElement).value = '1';
        (document.getElementById('languageSelect') as HTMLSelectElement).value = 'en';

        // 更新显示值
        document.getElementById('scrollSpeedValue')!.textContent = '40';
        document.getElementById('speedValue')!.textContent = '1.0x';

        // 应用默认设置（检查renderer是否已初始化）
        if (this.renderer) {
            this.renderer.setShowSV(true);
            this.renderer.setShowKeyGroup(true);
            this.renderer.setScrollSpeed(40);
        }
        this.audioManager.setPlaybackRate(1.0);
        this.isAuto = false;
        this.getAutos();

        // 触发语言变更
        const langSelect = document.getElementById('languageSelect') as HTMLSelectElement;
        langSelect.dispatchEvent(new Event('change'));

        // 清除本地存储
        localStorage.removeItem('gameSettings');


        this.showToast('设置已清除，恢复默认值！');
    }

    // 显示短暂提示消息
    private showToast(message: string): void {
        // 创建或获取toast元素
        let toast = document.getElementById('settingsToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'settingsToast';
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 12px 20px;
                border-radius: 6px;
                z-index: 1000;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                font-size: 14px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                transition: opacity 0.3s ease;
                opacity: 0;
            `;
            document.body.appendChild(toast);
        }

        toast.style.display = 'block';
        toast.textContent = message;
        toast.style.opacity = '1';

        // 2秒后自动隐藏
        setTimeout(() => {
            toast!.style.opacity = '0';
            setTimeout(() => {
                if (toast) {
                    toast.style.display = 'none';
                }
            }, 300);
        }, 2000);
    }
    async init() {
        const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        this.renderer = new GameRenderer(canvas);

        // 预加载音效
        await this.audioManager.loadSound('hit', 'res/Enda.wav');
        await this.audioManager.loadSound('judge', 'res/Okar.wav');

        this.bindEvents();
        this.getAutos();
        this.loadSettings(); // 加载保存的设置
    }

    bindEvents() {
        document.getElementById('oszFile')!.addEventListener('change', (e) => this.loadFile((e.target as HTMLInputElement).files![0]));
        document.getElementById('difficultySelect')!.addEventListener('change', (e) => {
            const index = parseInt((e.target as HTMLSelectElement).value);
            if (!isNaN(index)) this.selectDifficulty(index);
        });

        document.getElementById('playBtn')!.addEventListener('click', () => this.play(true));
        document.getElementById('pauseBtn')!.addEventListener('click', () => this.pause());
        document.getElementById('stopBtn')!.addEventListener('click', () => this.stop());

        document.getElementById('speedSlider')!.addEventListener('input', (e) => {
            const speed = parseFloat((e.target as HTMLInputElement).value);
            document.getElementById('speedValue')!.textContent = speed.toFixed(1) + 'x';
            this.audioManager.setPlaybackRate(speed);
            this.saveSettings(); // 自动保存设置
        });
        document.getElementById('showSV')!.addEventListener('change', (e) => {
            this.renderer!.setShowSV((e.target as HTMLInputElement).checked);
            this.saveSettings(); // 自动保存设置
        });
        document.getElementById('showKeyGroup')!.addEventListener('change', (e) => {
            this.renderer!.setShowKeyGroup((e.target as HTMLInputElement).checked);
            this.saveSettings(); // 自动保存设置
        });
        document.getElementById('scrollSpeed')!.addEventListener('input', (e) => {
            const speed = parseFloat((e.target as HTMLInputElement).value);
            //因为赋值顺序的原因因此不能更改类型赋值
            document.getElementById('scrollSpeedValue')!.textContent = speed.toString();
            this.renderer!.setScrollSpeed(speed);
            this.saveSettings(); // 自动保存设置
        });

        // 键盘输入
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
        document.getElementById('autoPlayBtn')!.addEventListener('change', (e) => {
            this.isAuto = (e.target as HTMLInputElement).checked; // 赋值
            this.getAutos();
            this.saveSettings(); // 使用统一的设置保存方法
        });

        // 禁用垂直同步监听
        document.getElementById('disableVsync')!.addEventListener('change', (e) => {
            if (this.renderer) {
                this.renderer.setDisableVsync((e.target as HTMLInputElement).checked);
            }
            this.saveSettings(); // 自动保存设置
        });

        // 语言选择变更监听
        document.getElementById('languageSelect')!.addEventListener('change', () => {
            this.saveSettings(); // 保存语言设置
        });

        // 设置保存和清除按钮事件
        document.getElementById('saveSettingsBtn')!.addEventListener('click', () => this.saveSettings());
        document.getElementById('clearSettingsBtn')!.addEventListener('click', () => this.clearSettings());

        let escPressTimer: ReturnType<typeof setTimeout> | null = null;
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
            this.renderer!.setPressedLanes(this.pressed);

            this.play(this.isend);
        }

        this.saveSettings(); // 使用统一的设置保存方法
    }

    keyToColumn(key: string) {
        const k = key.toLowerCase();
        return this.keyMap.indexOf(k);
    }

    onKeyDown(e: KeyboardEvent) {
        const col = this.keyToColumn(e.key);
        if (col === -1) return;

        if (!this.pressed.has(col)) {
            this.pressed.add(col);
            this.renderer!.setPressedLanes(this.pressed);
            this.tryJudgeOnPress(col).then(() => { });
            this.play_hit().then(null);
        }
        e.preventDefault();
    }

    onKeyUp(e: KeyboardEvent) {
        const col = this.keyToColumn(e.key);
        if (col === -1) return;

        if (this.pressed.has(col)) {
            this.pressed.delete(col);
            this.renderer!.setPressedLanes(this.pressed);
            this.tryJudgeOnRelease(col);
        }
        e.preventDefault();
    }

    async tryJudgeOnPress(col: number) {
        const t = this.audioManager.getCurrentTime(); // ms
        let list = this.columns[col];
        let idx = this.nextIndex[col];

        // 跳过已经过了miss时间的物件
        while (idx < list.length && (list[idx].time < t - this.windows.max_window)) {
            // 普通note过期或LN头过期 -> Miss
            const obj = list[idx];
            if (!obj.judgedHead) {
                await this.applyJudgement('Miss' as JudgementType, obj, col, true);
                obj.judgedHead = true;
            }
            idx++;
        }
        this.nextIndex[col] = idx;

        // 检查索引是否超出范围
        if (idx >= list.length) {
            return;
        }

        const obj = list[idx];
        if (!obj.isLongNote) {
            const diff = Math.abs(obj.time - t);
            const result = this.getJudgement(diff);
            if (result) {
                try {
                    await this.applyJudgement(result, obj, col, true);
                    obj.judgedHead = true;
                    this.nextIndex[col]++;
                } catch (error) {
                    console.error("Error applying judgement:", error);
                    // 可以在这里添加更详细的错误处理
                }
            } else {
                return "cat_err";
            }
        } else {
            // LN头判定
            if (!obj.judgedHead) {
                const diff = Math.abs(obj.time - t);
                const result = this.getJudgement(diff);
                if (result) {
                    try {
                        await this.applyJudgement(result as JudgementType, obj, col, true);
                        obj.judgedHead = true;
                        this.holdingLN[col] = obj; // 开始持有
                        // LN仍停留在列表里，等待尾判定
                    } catch (error) {
                        console.error("Error applying judgement:", error);
                        // 可以在这里添加更详细的错误处理
                    }
                }
            }
        }
    }

    tryJudgeOnRelease(col: number) {
        const t = this.audioManager.getCurrentTime();
        const obj = this.holdingLN[col];
        if (!obj) return;

        // LN尾判定
        const diff = Math.abs(obj.endTime - t);
        const result = this.getJudgement(diff);
        if (result) {
            this.applyJudgement(result, obj, col, false).then(null);
        } else {
            // 尾部未在窗口，视为Miss
            this.applyJudgement('Miss' as JudgementType, obj, col, false).then(null);
        }

        // 完成LN判定后推进索引到下一个
        // 当前nextIndex可能仍指向该LN（如果头部时未推进），推进到下一个未判定的
        const list = this.columns[col];
        while (this.nextIndex[col] < list.length && list[this.nextIndex[col]] === obj) {
            this.nextIndex[col]++;
        }
        this.holdingLN[col] = null;
    }

    getJudgement(diffMs: number): JudgementType | null {
        if (diffMs <= this.windows.perfect) return 'Perfect';
        if (diffMs <= this.windows.great) return 'Great';
        if (diffMs <= this.windows.good) return 'Good';
        if (diffMs <= this.windows.bad) return 'Bad';
        if (diffMs <= this.windows.miss) return 'Miss';
        return null;
    }

    async applyJudgement(j: JudgementType, obj: HitObject, col: number, isHead: boolean): Promise<void> {
        // 统计
        const weightMap = { Perfect: 1.0, Great: 0.9, Good: 0.7, Bad: 0.4, Miss: 0.0 };
        const scoreAddMap = { Perfect: 300, Great: 200, Good: 100, Bad: 50, Miss: 0 };
        const weight = weightMap[j];
        const scoreAdd = scoreAddMap[j];

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
        if ((this.renderer as any).showKeyGroup) {
            // j 是 'Great' 时才取对应的颜色,'Perfect' 时加一层金色判定
            if (j !== 'Miss') {
                if (j === 'Bad') {
                    color = '#afaeae';
                } else if (j === 'Great') {
                    color = '#7ecca7';
                } else {
                    const colors = (this.renderer as any).keyGroupColors;
                    const index = obj.keyGroup % colors.length;
                    color = colors[index];
                    if (j === 'Perfect') {
                        await this.renderer!.createHitEffect(col, '#eade57');
                    }
                }
            }
        }
        // 异步触发打击特效和音效
        if (j !== 'Miss') {
            // 使用 Promise.all 并行执行
            await Promise.all([
                this.renderer!.createHitEffect(col, color),
                this.play_hit(),
                j === 'Perfect' || j === 'Great' ? this.Okar_hit() : Promise.resolve()
            ]);
        }
        await this.renderer!.createHitEffect(col, color);
        this.renderer!.setStats(this.stats);
    }
    async play_hit() {
        this.audioManager.playSound_nonBlocking('hit', 1.0);
    }
    async Okar_hit() {
        this.audioManager.playSound_nonBlocking('judge', 0.7);
    }
    async loadFile(file: File) {
        if (this.currentBeatmap) {
            await this.audioManager.stop();
            await this.stop();
        }
        if (!file) return;
        try {
            let ext: Object;
            ext = file.name.split('.').pop()!.toLowerCase();
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

            const select = document.getElementById('difficultySelect') as HTMLSelectElement;
            select.innerHTML = '<option value="">选择难度</option>';
            this.beatmaps.forEach((bm: { filename: string; data: Beatmap }, index: number) => {
                const option = document.createElement('option');
                option.value = index.toString();
                option.textContent = bm.data.metadata.Version || `Difficulty ${index + 1}`;
                select.appendChild(option);
            });
            select.disabled = false;

            if (files.audio) {
                await this.audioManager.loadAudio(files.audio!.blob);
                if (this.totalTimeElement) this.totalTimeElement.textContent =
                    this.formatTime(this.audioManager.getDuration());
            }

            if (this.beatmaps.length > 0) {
                (select as HTMLSelectElement).value = '0';
                this.selectDifficulty(0);
            }

            // 加载背景图
            if (files.background) {
                try {
                    await this.renderer!.setBackgroundImageBlob(files.background!.blob);
                } catch (e) {
                    console.warn('背景加载失败', e);
                }
            }
            const target = document.getElementById('gameCanvas') as HTMLCanvasElement; // 你要滚动到的div
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' }); // 平滑滚动
            }

        } catch (e: any) {
            console.error('加载失败', e);
            alert('加载失败: ' + e.message);
        }

    }

    selectDifficulty(index: number) {
        this.currentBeatmap = this.beatmaps[index]!.data;
        this.renderer!.setBeatmap(this.currentBeatmap);

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
        this.renderer!.setBeatmap(this.currentBeatmap);

        // UI
        const { Creator, Artist, Title, Version } = this.currentBeatmap.metadata;
        document.getElementById('songTitle')!.textContent =
            Title || '未知歌曲';
        document.getElementById('songArtist')!.textContent =
            'Artist: ' + (Artist || '未知');
        document.getElementById('songMapper')!.textContent =
            'Chart: ' + (Creator || '未知') +
            ' | Difficult: ' + (Version || '未知');

        // 重置统计
        this.stats = {
            score: 0, combo: 0, acc: 100, totalHits: 0, weightedHits: 0,
            judgements: { Perfect: 0, Great: 0, Good: 0, Bad: 0, Miss: 0 }
        };
        this.renderer!.setStats(this.stats);

        // 重置进度条样式
        if (this.progressFill) {
            this.progressFill.style.width = '0%';
            this.progressFill.style.height = '';
            this.progressFill.style.position = '';
            this.progressFill.style.top = '';
            this.progressFill.style.left = '';
            this.progressFill.style.zIndex = '';
            this.progressFill.style.transition = '';
            this.progressFill.style.background = '';
            this.progressFill.style.boxShadow = '';
        }

        // 重置结果面板
        if (this.resultPanel) {
            this.resultPanel.style.width = '0';
            this.resultPanel.style.transition = 'none';
            this.resultPanel.style.position = '';
            this.resultPanel.style.top = '';
            this.resultPanel.style.left = '';
            this.resultPanel.style.height = '';
            this.resultPanel.style.backgroundColor = '';
            this.resultPanel.style.zIndex = '';
            this.resultPanel.style.overflow = '';
        }

        // 重置Chart信息位置
        if (this.infoPanelElement) {
            this.infoPanelElement.style.transition = 'none';
            this.infoPanelElement.style.transform = '';
        }

        (document.getElementById('playBtn') as HTMLButtonElement).disabled = false;
        (document.getElementById('pauseBtn') as HTMLButtonElement).disabled = false;
        (document.getElementById('stopBtn') as HTMLButtonElement).disabled = false;

        this.renderer!.render(0);
    }

    play(ev: boolean) {
        // 如果没有谱面，直接返回
        if (!this.currentBeatmap) return;

        // 如果游戏是暂停状态（isntPaused为false且columns不为空），恢复播放
        if (!this.isntPaused && this.columns.some(col => col.length > 0)) {
            this.resume();
            return;
        }

        // 否则重新开始游戏（包括停止状态）
        this.stop(); // 停止当前播放
        // 如果已经在等待，就不重复触发
        if (this.waitingForStart) return;

        // 设置状态为等待按键
        this.waitingForStart = true;
        const overlay = document.getElementById('pauseOverlay')!;
        overlay.style.opacity = '0.8';
        overlay.innerHTML = '<div style="color:white;font-size:32px;text-align:center;margin-top:40vh;">Press Any Button...</div>';
        // 一次性按键监听
        const startHandler = (e: KeyboardEvent) => {
            // ① 如果按的是 Esc，则不启动
            if (e.key === 'Escape') return;

            // ② 否则真的开始
            window.removeEventListener('keydown', startHandler);
            overlay.style.opacity = '0';
            overlay.innerHTML = '';
            this.waitingForStart = false;

            if (ev && this.isntPaused) {
                this.stats = {
                    score: 0, combo: 0, acc: 100, totalHits: 0, weightedHits: 0,
                    judgements: { Perfect: 0, Great: 0, Good: 0, Bad: 0, Miss: 0 }
                };
            }

            this.saveSettings(); // 使用统一的设置保存方法

            this.startGame();
            this.isend = false;
        };
        window.addEventListener('keydown', startHandler);
    }
    startGame() {
        const settingsPanel = document.querySelector('.settings-panel');
        const playbackPanel = document.querySelector('.playback-controls');
        settingsPanel!.classList.toggle('.settings-panel', false);
        playbackPanel!.classList.toggle('.playback-controls', false);
        // 清空所有按键状态，防止恢复时有按键残留
        this.pressed.clear();
        this.renderer!.setPressedLanes(this.pressed);

        // 只有在columns缓存为空时才重建（停止后重新播放）
        // 暂停恢复时columns不为空，保持现有状态
        if (this.currentBeatmap && this.columns.every(col => col.length === 0)) {
            this.columns = [[], [], [], []];
            for (const obj of this.currentBeatmap.hitObjects) {
                this.columns[obj.column].push(obj);
                obj.judgedHead = false;
                obj.judgedTail = false;
            }
            for (let c = 0; c < 4; c++) {
                this.columns[c].sort((a, b) => a.time - b.time);
            }
            this.nextIndex = [0, 0, 0, 0];
            this.holdingLN = [null, null, null, null];
        }

        const t = this.audioManager.getCurrentTime() / 1000;
        this.audioManager.play(t);
        this.startGameLoop();
        const overlay = document.getElementById('pauseOverlay');
        overlay!.style.opacity = '0';
        this.isntPaused = true;
        // this.renderer.ctx.opacity = 1;
    }



    pause() {
        this.audioManager.pause();
        this.stopGameLoop();
        // 让遮罩层变暗
        const overlay: HTMLElement | null = document.getElementById('pauseOverlay');
        overlay!.style.opacity = '0.6'; // 暗化程度，可调整
        overlay!.innerHTML = '<div style="color:white;font-size:50px;text-align:center;margin-top:40vh;">Pausing...</div>';
        const settingsPanel: HTMLElement | null = document.querySelector('.settings-panel');
        const playbackPanel: HTMLElement | null = document.querySelector('.playback-controls');
        settingsPanel!.classList.toggle('active', true);
        playbackPanel!.classList.toggle('active', true);
        this.isntPaused = false;

        this.saveSettings(); // 使用统一的设置保存方法
    }

    resume() {
        this.audioManager.play(this.audioManager.getCurrentTime() / 1000);
        this.startGameLoop();
        const overlay = document.getElementById('pauseOverlay');
        overlay!.style.opacity = '0';
        this.isntPaused = true;
    }

    stop() {
        this.audioManager.stop();
        this.stopGameLoop();

        // 清画面（0 时刻）
        this.renderer!.render(0).then(() => { });

        // 清状态
        this.pressed.clear();
        this.renderer!.setPressedLanes(this.pressed);

        this.holdingLN = [null, null, null, null];
        this.columns = [[], [], [], []]; // 重新初始化 columns
        this.nextIndex = [0, 0, 0, 0];
        this.waitingForStart = false;
        const wasNaturalEnd = this.naturalEnd;
        this.naturalEnd = false;
        // 重置 hit 状态
        if (this.currentBeatmap?.hitObjects) {
            for (const obj of this.currentBeatmap.hitObjects) {
                obj.judgedHead = false;
                obj.judgedTail = false;
            }
        }
        // 重置统计并立即应用到渲染器（自然结束时保留分数）
        if (!wasNaturalEnd) {
            this.stats = {
                score: 0, combo: 0, acc: 100,
                totalHits: 0, weightedHits: 0,
                judgements: { Perfect: 0, Great: 0, Good: 0, Bad: 0, Miss: 0 }
            };
            this.renderer!.setStats(this.stats);
        }
        // this.renderer.ctx.opacity = 0;

        // 其它遮罩
        const overlay = document.getElementById('pauseOverlay');
        overlay!.style.opacity = '0.6';
        this.isntPaused = false;
        if (!this.audioManager.getIsPlaying() && !this.isend) {
            this.isend = true;
        }

        // 清 hitEffects
        if (this.renderer) this.renderer.clearHitEffects();
        if (this.isend && this.isntPaused) {
            this.ToResult(this.ShowScore);
        }

        // 重置进度条样式
        if (this.progressFill) {
            this.progressFill.style.width = '0%';
            this.progressFill.style.height = '';
            this.progressFill.style.position = '';
            this.progressFill.style.top = '';
            this.progressFill.style.left = '';
            this.progressFill.style.zIndex = '';
            this.progressFill.style.transition = '';
            this.progressFill.style.background = '';
            this.progressFill.style.boxShadow = '';
        }

        // 重置结果面板（自然结束时保留显示）
        if (this.resultPanel && !wasNaturalEnd) {
            this.resultPanel.style.width = '0';
            this.resultPanel.style.transition = 'none';
            this.resultPanel.style.position = '';
            this.resultPanel.style.top = '';
            this.resultPanel.style.left = '';
            this.resultPanel.style.height = '';
            this.resultPanel.style.backgroundColor = '';
            this.resultPanel.style.zIndex = '';
            this.resultPanel.style.overflow = '';
        }

        // 重置Chart信息位置（自然结束时保留显示）
        if (this.infoPanelElement && !wasNaturalEnd) {
            this.infoPanelElement.style.transition = 'none';
            this.infoPanelElement.style.transform = '';
        }

        this.saveSettings(); // 使用统一的设置保存方法
    }

    ToResult(score: any) {
        const resultLeftElement = document.getElementById("result-Left");
        if (resultLeftElement) {
            resultLeftElement.textContent = score.score ? score.score.toString() : score;
        }

        // 在结果面板中显示分数信息
        if (this.resultPanel) {
            const stats = score;
            this.resultPanel.innerHTML = `
                <div style="padding: 20px; color: #333; font-family: sans-serif;opacity: 1">
                    <h1 style="color: #444; margin-bottom: 20px;">游戏结果</h1>
                    <h2 style="color: #444; margin-bottom: 20px;">result</h2>
                    <div style="margin-bottom: 10px;">
                        <strong>分数:</strong> ${stats.score}
                    </div>
                    <div style="margin-bottom: 10px;">
                        <strong>最大连击:</strong> ${stats.combo}
                    </div>
                    <div style="margin-bottom: 10px;">
                        <strong>准确率:</strong> ${stats.acc.toFixed(2)}%
                    </div>
                    <div style="margin-top: 20px;">
                        <strong>判定统计:</strong>
                        <div>Perfect: ${stats.judgements.Perfect}</div>
                        <div>Great: ${stats.judgements.Great}</div>
                        <div>Good: ${stats.judgements.Good}</div>
                        <div>Bad: ${stats.judgements.Bad}</div>
                        <div>Miss: ${stats.judgements.Miss}</div>
                    </div>
                </div>
            `;
        }
    }

    startGameLoop() {
        const loop = () => {
            if (!this.audioManager.getIsPlaying()) return;
            const currentTime = this.audioManager.getCurrentTime(); // ms
            this.renderer!.render(currentTime);

            const duration = this.audioManager.getDuration();
            const progress = (currentTime / 1000 / duration) * 100;
            if (this.progressFill) this.progressFill.style.width = progress + '%';
            if (this.currentTimeElement) this.currentTimeElement.textContent =
                this.formatTime(currentTime / 1000);

            // 自动Miss：对于已过miss窗口但未判定的普通note/ln头，给Miss并推进索引
            for (let c = 0; c < 4; c++) {
                const list = this.columns[c];
                while (this.nextIndex[c] < list.length) {
                    const obj = list[this.nextIndex[c]];
                    const deadline = obj.isLongNote ? obj.time : obj.time;
                    if (deadline < currentTime - this.windows.max_window && !obj.judgedHead) {
                        this.applyJudgement((this.isAuto ? 'Perfect' : 'Miss') as JudgementType, obj, c, true).then(null);
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
                                this.applyJudgement((this.isAuto ? 'Perfect' : 'Miss') as JudgementType, obj, c, false).then(null);
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

    formatTime(seconds: any) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
