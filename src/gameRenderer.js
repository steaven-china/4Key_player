// 游戏渲染器 - 使用 Worker 处理粒子
export class GameRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });

        this.beatmap = null;
        this.currentTime = 0;
        this.scrollSpeed = 800;
        this.showSV = true;
        this.showKeyGroup = true;

        this.laneWidth = 120;
        this.laneCount = 4;
        this.judgmentLineY = 0;

        this.visibleLeadTime = 5000;
        this.visibleTrail = 46;

        this.bgImage = null;
        this.bgReady = false;
        this.bgAlpha = 0.15;

        // 粒子数据（由 Worker 更新）
        this.ambientParticles = [];
        this.hitEffects = [];
        this.ambientCount = 160;

        this.pressedLanes = new Set();

        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');

        this.keyGroupColors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
            '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'
        ];

        this.stats = { score: 0, combo: 0, acc: 100, judgements: {} };

        this.fps = 0;
        this.frameCount = 0;
        this.lastFpsUpdate = Date.now();

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // 初始化 Worker
        this.initWorker();

        this._lastFrameTime = performance.now();
        this._accum = 0;

        // 异步任务队列
        this.pendingTasks = [];
    }

    initWorker() {
        try {
            this.particleWorker = new Worker('src/particleWorker.js');

            this.particleWorker.onmessage = (e) => {
                const { type, data } = e.data;

                switch(type) {
                    case 'ambientInit':
                    case 'ambientUpdate':
                        this.ambientParticles = data;
                        break;
                    case 'hitUpdate':
                        this.hitEffects = data;
                        break;
                }
            };

            // 初始化环境粒子
            this.particleWorker.postMessage({
                type: 'initAmbient',
                data: {
                    count: this.ambientCount,
                    width: this.width,
                    height: this.height
                }
            });

            console.log('Particle Worker initialized');
        } catch (e) {
            console.warn('Worker not supported, using fallback', e);
            this.initAmbientParticles(); // 降级方案
        }
    }

    // 异步创建打击特效
    async createHitEffect(column, keyGroupColor) {
        const totalWidth = this.laneWidth * this.laneCount;
        const startX = (Math.random() * 10) + (this.width - totalWidth) / 2;
        const x = startX + (column * this.laneWidth) + this.laneWidth / 2;
        const y = this.judgmentLineY;
        const color = keyGroupColor || '#FFFFFF';

        if (this.particleWorker) {
            // 使用 Worker
            return new Promise((resolve) => {
                this.particleWorker.postMessage({
                    type: 'createHit',
                    data: { x, y, color, laneWidth: this.laneWidth }
                });
                resolve();
            });
        } else {
            // 降级：直接创建
            console.log("Fallback");
            return this.createHitEffectFallback(column, keyGroupColor);
        }
    }

    // 降级方案：直接创建粒子
    async createHitEffectFallback(column, keyGroupColor) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const totalWidth = this.laneWidth * this.laneCount;
                const startX = (Math.random() * 10) + (this.width - totalWidth) / 2;
                const x = startX + (column * this.laneWidth) + this.laneWidth / 2;
                const y = this.judgmentLineY;
                const color = keyGroupColor || '#FFFFFF';

                const particleCount = 30;
                for (let i = 0; i < particleCount; i++) {
                    const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 2);
                    const base = 0.8;
                    const speed = base * Math.sqrt(Math.random());
                    const vx = Math.cos(angle) * speed * 0.8;
                    const vy = Math.sin(angle) * speed;

                    this.hitEffects.push({
                        x, y, vx, vy,
                        life: 1.5,
                        decay: 0.02 + Math.random() * 0.02,
                        size: (this.laneWidth / 2 - 5) + Math.random() * 7,
                        color
                    });
                }

                this.hitEffects.push({
                    x, y, vx: -0.2, vy: 0, life: 10, decay: 0.6,
                    size: Math.random() * 10, color, isExplosion: true
                });

                resolve();
            }, 0);
        });
    }

    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';

        this.offscreenCanvas.width = this.canvas.width;
        this.offscreenCanvas.height = this.canvas.height;

        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        this.offscreenCtx.setTransform(1, 0, 0, 1, 0, 0);
        this.offscreenCtx.scale(dpr, dpr);

        this.width = rect.width;
        this.height = rect.height;
        this.judgmentLineY = this.height - 100;
    }

    setBeatmap(beatmap) {
        this.beatmap = beatmap;
    }

    setScrollSpeed(speed) {
        this.scrollSpeed = Math.max(200, speed * 40);
    }

    setShowSV(show) { this.showSV = show; }
    setShowKeyGroup(show) { this.showKeyGroup = show; }
    setStats(stats) { this.stats = stats; }
    setPressedLanes(set) { this.pressedLanes = new Set(set); }

    async setBackgroundImageBlob(blob) {
        if (!blob) {
            this.bgImage = null;
            this.bgReady = false;
            return;
        }
        const url = URL.createObjectURL(blob);
        await this.setBackgroundImageURL(url);
    }

    setBackgroundImageURL(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.bgImage = img;
                this.bgReady = true;
                resolve();
            };
            img.onerror = reject;
            img.src = url;
        });
    }

    svAreaAt(t) {
        const segs = this.beatmap?.svSegments || [];
        const areas = this.beatmap?.svCumAreas || [];
        if (!segs.length) return t;

        let idx = 0, lo = 0, hi = segs.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const s = segs[mid];
            if (t < s.start) hi = mid - 1;
            else if (s.end !== Infinity && t >= s.end) lo = mid + 1;
            else { idx = mid; break; }
        }
        const seg = segs[idx];
        const base = areas[idx] || 0;
        const end = seg.end === Infinity ? t : seg.end;
        const clampedT = Math.max(seg.start, Math.min(t, end));
        return base + seg.sv * (clampedT - seg.start);
    }

    noteYAt(time) {
        const k = this.scrollSpeed / 1000;
        if (!this.showSV || !this.beatmap?.svSegments?.length) {
            const dt = time - this.currentTime;
            return this.judgmentLineY - k * dt;
        }
        const aNote = this.svAreaAt(time);
        const aNow = this.svAreaAt(this.currentTime);
        return this.judgmentLineY - k * (aNote - aNow);
    }

    initAmbientParticles() {
        this.ambientParticles = [];
        for (let i = 0; i < this.ambientCount; i++) {
            this.ambientParticles.push(this.makeAmbientParticle());
        }
    }

    makeAmbientParticle() {
        return {
            x: Math.random() * this.width,
            y: Math.random() * this.height,
            r: 1.5 + Math.random() * 2.5,
            alpha: 0.10 + Math.random() * 0.15,
            vx: (Math.random() - 0.5) * 0.15,
            vy: -0.05 - Math.random() * 0.35
        };
    }

    updateAmbientParticles() {
        if (this.particleWorker) {
            // 使用 Worker 更新
            this.particleWorker.postMessage({
                type: 'updateAmbient',
                data: { width: this.width, height: this.height }
            });
        } else {
            // 降级方案
            for (const p of this.ambientParticles) {
                p.x += p.vx;
                p.y += p.vy;
                if (p.y < -10) {
                    p.x = Math.random() * this.width;
                    p.y = this.height + 10;
                    p.vx = (Math.random() - 0.5) * 0.15;
                    p.vy = -0.05 - Math.random() * 0.15;
                    p.r = 1.5 + Math.random() * 2.5;
                    p.alpha = 0.10 + Math.random() * 0.15;
                }
                if (p.x < -10 || p.x > this.width + 10) {
                    p.vx *= -1;
                }
            }
        }
    }

    drawAmbientParticles() {
        for (const p of this.ambientParticles) {
            this.ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    async render(currentTime) {
        this.currentTime = currentTime;

        this.drawBackgroundBase();
        this.drawAmbientParticles();
        this.drawBlurOverlay();
        this.drawLanes();
        await this.drawHitObjects();
        this.drawMeasures();
        this.drawHitEffects();

        const now = performance.now();
        let dt = (now - this._lastFrameTime) / 1000;
        this._lastFrameTime = now;
        dt = Math.min(dt, 0.05);

        this._accum += dt;
        const step = 1 / 100;
        while (this._accum >= step) {
            await this.updateHitEffects(step);
            await this.updateAmbientParticles();
            this._accum -= step;
        }

        this.drawJudgmentLine();
        this.drawHUD();
        this.updateFPS();
        await this.drawHitObjects();
    }

    updateHitEffects() {
        if (this.particleWorker) {
            // 使用 Worker 更新
            this.particleWorker.postMessage({
                type: 'updateHit',
                data: { height: this.height }
            });
        } else {
            // 降级方案
            const next = [];
            for (const e of this.hitEffects) {
                e.x += e.vx;
                e.y += e.vy;
                e.vy += 0.05;
                e.life -= e.decay;
                if (e.isExplosion) e.size *= 0.9;
                else e.size *= 0.93;

                if (e.life > 0 && e.y > 30 && e.y < this.height + 30) {
                    next.push(e);
                }
            }
            this.hitEffects = next;
        }
    }

    drawHitEffects() {
        for (const e of this.hitEffects) {
            if (e.isExplosion) {
                const g = this.ctx.createRadialGradient(e.x, e.y, 100, e.x, e.y, e.size);
                g.addColorStop(0, this.setAlpha(e.color, e.life * 0.6));
                g.addColorStop(1, this.setAlpha(e.color, 0));
                this.ctx.fillStyle = g;
                this.ctx.beginPath();
                this.ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
                this.ctx.fill();
            } else {
                this.ctx.fillStyle = this.setAlpha(e.color, e.life);
                this.ctx.beginPath();
                this.ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
    }

    // ... 其他方法保持不变 ...
    drawBackgroundBase() {
        const g = this.ctx.createLinearGradient(0, 0, 0, this.height);
        g.addColorStop(0, '#0f0f1a');
        g.addColorStop(1, '#0b0b16');
        this.ctx.fillStyle = g;
        this.ctx.fillRect(0, 0, this.width, this.height);

        if (this.bgReady && this.bgImage) {
            const img = this.bgImage;
            const iw = img.width, ih = img.height;
            const scale = Math.max(this.width / iw, this.height / ih);
            const drawW = iw * scale, drawH = ih * scale;
            const dx = (this.width - drawW) / 2;
            const dy = (this.height - drawH) / 2;

            this.ctx.globalAlpha = this.bgAlpha;
            this.ctx.drawImage(img, dx, dy, drawW, drawH);
            this.ctx.globalAlpha = 1.0;
        }
    }

    drawBlurOverlay() {
        this.ctx.save();
        this.ctx.filter = 'blur(4px)';
        const haze = this.ctx.createLinearGradient(0, 0, 0, this.height);
        haze.addColorStop(0, 'rgba(0,0,0,0.08)');
        haze.addColorStop(1, 'rgba(0,0,0,0.18)');
        this.ctx.fillStyle = haze;
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.ctx.restore();
    }

    drawLanes() {
        const totalWidth = this.laneWidth * this.laneCount;
        const startX = (this.width - totalWidth) / 2;

        this.ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for (let i = 0; i < this.laneCount; i += 2) {
            this.ctx.fillRect(startX + i * this.laneWidth, 0, this.laneWidth, this.height);
        }
        this.ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        this.ctx.lineWidth = 2;
        for (let i = 0; i <= this.laneCount; i++) {
            const x = startX + i * this.laneWidth;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.height);
            this.ctx.stroke();
        }

        for (let i = 0; i < this.laneCount; i++) {
            if (this.pressedLanes.has(i)) {
                const x = startX + i * this.laneWidth;
                this.ctx.fillStyle = 'rgba(255,255,255,0.08)';
                this.ctx.fillRect(x, this.judgmentLineY - 80, this.laneWidth, 160);
            }
        }
    }

    drawHitObjects() {
        if (!this.beatmap || !this.beatmap.hitObjects) return;
        const objs = this.beatmap.hitObjects;
        const totalWidth = this.laneWidth * this.laneCount;
        const startX = (this.width - totalWidth) / 2;
        const noteWidth = this.laneWidth - 10;
        const noteHeight = 15;
        const fadeEarly = 150;

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(0, 14, this.width, this.judgmentLineY);
        this.ctx.clip();

        const calcAlpha = (hitTime) => {
            const timeToHit = hitTime - this.currentTime;
            let alpha;
            if (timeToHit <= fadeEarly) {
                const fadeProgress = (fadeEarly - timeToHit) / (fadeEarly + this.visibleTrail);
                alpha = 1 - Math.min(1, fadeProgress);
            } else {
                alpha = 1;
            }
            return Math.pow(alpha, 0.5);
        };

        for (const obj of objs) {
            const lastTime = obj.isLongNote ? obj.endTime : obj.time;
            if (lastTime < this.currentTime - this.visibleTrail) continue;
            if (obj.time > this.currentTime + this.visibleLeadTime) continue;

            const x = startX + obj.column * this.laneWidth;
            const color = this.showKeyGroup
                ? this.keyGroupColors[obj.keyGroup % this.keyGroupColors.length]
                : '#FFFFFF';

            if (obj.isLongNote) {
                const headY = this.noteYAt(obj.time);
                const tailY = this.noteYAt(obj.endTime);

                const visibleHeadY = Math.min(headY, this.judgmentLineY);
                const visibleTailY = Math.min(tailY, this.judgmentLineY);
                const bodyTop = Math.max(Math.min(visibleHeadY, visibleTailY), 0);
                const bodyBottom = Math.min(Math.max(visibleHeadY, visibleTailY), this.judgmentLineY);
                const bodyLen = Math.max(0, bodyBottom - bodyTop);

                if (bodyLen > 0) {
                    const grad = this.ctx.createLinearGradient(x + 5, bodyTop, x + 5, bodyBottom);
                    grad.addColorStop(0, this.setAlpha(color, 0.35));
                    grad.addColorStop(1, this.setAlpha(color, 0.6));
                    this.ctx.fillStyle = grad;
                    this.ctx.fillRect(x + 5, bodyTop, noteWidth, bodyLen);
                    this.ctx.strokeStyle = this.setAlpha(color, 0.9);
                    this.ctx.lineWidth = 2;
                    this.ctx.strokeRect(x + 5, bodyTop, noteWidth, bodyLen);
                }

                if (headY >= 0 && headY < this.judgmentLineY) {
                    this.drawNoteRect(x, headY, noteWidth, noteHeight, color, calcAlpha(obj.time));
                }

                if (tailY >= 0 && tailY < this.judgmentLineY) {
                    this.drawNoteRect(
                        x, tailY, noteWidth, noteHeight * 0.3,
                        this.adjustBrightness(color, -20),
                        calcAlpha(obj.endTime)
                    );
                }
            } else {
                const y = this.noteYAt(obj.time);
                if (y < 0 || y > this.judgmentLineY) continue;

                this.drawNoteRect(x, y, noteWidth, noteHeight, color, calcAlpha(obj.time));
            }
        }

        this.ctx.restore();
    }

    drawNoteRect(x, y, w, h, color, alphaFactor = 1.0) {
        const distance = Math.abs(y - this.judgmentLineY);
        const baseAlpha = Math.max(0.35, 1 - (distance / this.height) * 0.5);
        const alpha = Math.max(0, Math.min(1, baseAlpha * alphaFactor));

        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = color;
        const grad = this.ctx.createLinearGradient(x, y - h / 2, x, y + h / 2);
        grad.addColorStop(0, this.setAlpha(color, alpha));
        grad.addColorStop(1, this.setAlpha(this.adjustBrightness(color, -30), alpha));
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(x + 5, y - h / 2, w, h);

        this.ctx.strokeStyle = this.setAlpha(this.adjustBrightness(color, 40), alpha);
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x + 5, y - h / 2, w, h);
        this.ctx.shadowBlur = 0;
    }

    drawJudgmentLine() {
        const totalWidth = this.laneWidth * this.laneCount;
        const startX = (this.width - totalWidth) / 2;
        this.ctx.shadowBlur = 12;
        this.ctx.shadowColor = '#FFD700';
        const gradient = this.ctx.createLinearGradient(startX, 0, startX + totalWidth, 0);
        gradient.addColorStop(0, 'rgba(255,215,0,0.5)');
        gradient.addColorStop(0.5, 'rgba(255,215,0,1)');
        gradient.addColorStop(1, 'rgba(255,215,0,0.5)');
        this.ctx.strokeStyle = gradient;
        this.ctx.lineWidth = 4;
        this.ctx.beginPath();
        this.ctx.moveTo(startX - 10, this.judgmentLineY);
        this.ctx.lineTo(startX + totalWidth + 10, this.judgmentLineY);
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
    }

    drawHUD() {
        const pad = 10;
        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this.ctx.fillRect(pad, pad, 220, 100);
        this.ctx.fillStyle = '#FFF';
        this.ctx.font = '14px monospace';
        this.ctx.fillText(`Time: ${(this.currentTime / 1000).toFixed(2)}s`, pad + 10, pad + 25);
        this.ctx.fillText(`FPS: ${this.fps}`, pad + 10, pad + 45);
        this.ctx.fillText(`Combo: ${this.stats.combo || 0}`, pad + 110, pad + 25);
        this.ctx.fillText(`Score: ${this.stats.score || 0}`, pad + 110, pad + 45);
        this.ctx.fillText(`Acc: ${(this.stats.acc || 100).toFixed(2)}%`, pad + 110, pad + 65);
    }

    updateFPS() {
        this.frameCount++;
        const now = Date.now();
        if (now - this.lastFpsUpdate >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = now;
        }
    }

    adjustBrightness(color, amount) {
        const hex = color.replace('#', '');
        const r = Math.max(0, Math.min(255, parseInt(hex.substr(0, 2), 16) + amount));
        const g = Math.max(0, Math.min(255, parseInt(hex.substr(2, 2), 16) + amount));
        const b = Math.max(0, Math.min(255, parseInt(hex.substr(4, 2), 16) + amount));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    setAlpha(color, alpha) {
        const hex = color.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    drawMeasures() {
        if (!this.beatmap || !this.beatmap.measures) return;

        const totalWidth = this.laneWidth * this.laneCount;
        const startX = (this.width - totalWidth) / 2;

        this.ctx.strokeStyle = 'rgba(134,156,232,0.71)';
        this.ctx.lineWidth = 1;

        for (const measureTime of this.beatmap.measures) {
            const y = this.noteYAt(measureTime);
            if (y > this.judgmentLineY) continue;

            this.ctx.beginPath();
            this.ctx.moveTo(startX, y);
            this.ctx.lineTo(startX + totalWidth, y);
            this.ctx.stroke();
        }
    }

    dispose() {
        if (this.particleWorker) {
            this.particleWorker.terminate();
        }
    }
}
