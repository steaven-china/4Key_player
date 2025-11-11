// 游戏渲染器（层级重排+上向粒子+淡出+背景模糊+环境粒子）
export class GameRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });

        this.beatmap = null;
        this.currentTime = 0;     // ms
        this.scrollSpeed = 800;   // 像素/秒
        this.showSV = true;
        this.showKeyGroup = true;

        this.laneWidth = 120;
        this.laneCount = 4;
        this.judgmentLineY = 0;

        this.visibleLeadTime = 3000; // 提前显示(ms)
        this.visibleTrail = 46;     // 过判定线后保留(ms)用于淡出

        // 背景与环境粒子
        this.bgImage = null;
        this.bgReady = false;
        this.bgAlpha = 0.15; // 背景透明度
        this.ambientParticles = [];
        this.ambientCount = 160;

        // 命中粒子（游戏层）
        this.hitEffects = [];
        this.pressedLanes = new Set();

        // 离屏（可选）
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');

        // 颜色
        this.keyGroupColors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
            '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'
        ];

        // 统计
        this.stats = { score: 0, combo: 0, acc: 100, judgements: {} };

        // FPS
        this.fps = 0; this.frameCount = 0; this.lastFpsUpdate = Date.now();

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        this.initAmbientParticles();
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

    // 背景图设置（blob或URL都可）
    async setBackgroundImageBlob(blob) {
        if (!blob) { this.bgImage = null; this.bgReady = false; return; }
        const url = URL.createObjectURL(blob);
        await this.setBackgroundImageURL(url);
        // 不撤销URL以便重复渲染，停止时在外部清理也可
    }
    setBackgroundImageURL(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => { this.bgImage = img; this.bgReady = true; resolve(); };
            img.onerror = reject;
            img.src = url;
        });
    }

    // SV积分：使用beatmap.svSegments与svCumAreas
    svAreaAt(t) {
        const segs = this.beatmap?.svSegments || [];
        const areas = this.beatmap?.svCumAreas || [];
        if (!segs.length) return t;

        // 定位段
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

    // 正确下落位置：Y = 判定线 - (scrollSpeed/1000) * ( area(noteTime) - area(now) )
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

    // 环境粒子初始化
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
            vy: -0.05 - Math.random() * 0.35 // 缓慢向上
        };
    }
    updateAmbientParticles() {
        for (const p of this.ambientParticles) {
            p.x += p.vx; p.y += p.vy;
            if (p.y < -10) { // 重新生成到底部
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
    drawAmbientParticles() {
        for (const p of this.ambientParticles) {
            this.ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    render(currentTime) {
        this.currentTime = currentTime;

        // 底层：背景（15%）
        this.drawBackgroundBase();

        // 环境粒子（在模糊层下）
        this.updateAmbientParticles();
        this.drawAmbientParticles();

        // 模糊层（覆盖于环境粒子之上，制造朦胧感）
        this.drawBlurOverlay();


        // 游戏层：轨道与物件
        this.drawLanes();
        this.drawHitObjects();
        // 命中粒子
        this.drawHitEffects();
        this.updateHitEffects();

        // 判定线与HUD
        this.drawJudgmentLine();
        this.drawHUD();



        // FPS
        this.updateFPS();
    }

    drawBackgroundBase() {
        // 清背景色，避免透明区域
        const g = this.ctx.createLinearGradient(0, 0, 0, this.height);
        g.addColorStop(0, '#0f0f1a'); g.addColorStop(1, '#0b0b16');
        this.ctx.fillStyle = g;
        this.ctx.fillRect(0, 0, this.width, this.height);

        if (this.bgReady && this.bgImage) {
            const img = this.bgImage;
            const iw = img.width, ih = img.height;
            // 等比铺满
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
        // 轻薄朦胧层（不真正模糊下层内容，仅营造雾气）
        this.ctx.save();
        // 使用轻微模糊自身边缘
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

        // 背色与分隔
        this.ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for (let i = 0; i < this.laneCount; i += 2) {
            this.ctx.fillRect(startX + i * this.laneWidth, 0, this.laneWidth, this.height);
        }
        this.ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        this.ctx.lineWidth = 2;
        for (let i = 0; i <= this.laneCount; i++) {
            const x = startX + i * this.laneWidth;
            this.ctx.beginPath(); this.ctx.moveTo(x, 0); this.ctx.lineTo(x, this.height); this.ctx.stroke();
        }

        // 按键高亮
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
        const fadeEarly = 150; // 提前淡出时间

        this.ctx.save();

        // 限制绘制区域：判定线上方
        this.ctx.beginPath();
        this.ctx.rect(0, 14, this.width, this.judgmentLineY);
        this.ctx.clip();

        // 透明度计算函数
        const calcAlpha = (hitTime) => {
            const timeToHit = hitTime - this.currentTime;
            let alpha;
            if (timeToHit <= fadeEarly) {
                const fadeProgress = (fadeEarly - timeToHit) / (fadeEarly + this.visibleTrail);
                alpha = 1 - Math.min(1, fadeProgress);
            } else {
                alpha = 1;
            }
            return Math.pow(alpha, 0.5); // 柔和淡出
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

                // 限制身体位置在判定线上方
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

                // 头部（只显示判定线上方）
                if (headY >= 0 && headY < this.judgmentLineY) {
                    this.drawNoteRect(x, headY, noteWidth, noteHeight, color, calcAlpha(obj.time));
                }

                // 尾部
                if (tailY >= 0 && tailY < this.judgmentLineY) {
                    this.drawNoteRect(
                        x, tailY, noteWidth, noteHeight * 0.3,
                        this.adjustBrightness(color, -20),
                        calcAlpha(obj.endTime)
                    );
                }
            } else {
                const y = this.noteYAt(obj.time);
                if (y < 0 || y > this.judgmentLineY) continue; // 跳过判定线下的音符

                this.drawNoteRect(x, y, noteWidth, noteHeight, color, calcAlpha(obj.time));
            }
        }

        this.ctx.restore(); // 恢复绘制区域
    }


    drawNoteRect(x, y, w, h, color, alphaFactor = 1.0) {
        // 距离判定线的透明度（前段）
        const distance = Math.abs(y - this.judgmentLineY);
        const baseAlpha = Math.max(0.35, 1 - (distance / this.height) * 0.5);
        const alpha = Math.max(0, Math.min(1, baseAlpha * alphaFactor));

        this.ctx.shadowBlur = 10; this.ctx.shadowColor = color;
        const grad = this.ctx.createLinearGradient(x, y - h/2, x, y + h/2);
        grad.addColorStop(0, this.setAlpha(color, alpha));
        grad.addColorStop(1, this.setAlpha(this.adjustBrightness(color, -30), alpha));
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(x + 5, y - h/2, w, h);

        this.ctx.strokeStyle = this.setAlpha(this.adjustBrightness(color, 40), alpha);
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x + 5, y - h/2, w, h);
        this.ctx.shadowBlur = 0;
    }

    // 命中粒子：只向上方，短生命周期；
    createHitEffect(column,keyGroupColor) {
        const totalWidth = this.laneWidth * this.laneCount;
        const startX = (Math.random()*10)+(this.width - totalWidth) / 2;
        const x = startX + (column * this.laneWidth) + this.laneWidth / 2;
        const y = this.judgmentLineY;
        const color = keyGroupColor || '#FFFFFF';

        const particleCount = 30;
        for (let i = 0; i < particleCount; i++) {
            // 上方扇形（-100° 到 -80°附近），vy为负
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 2); // 约 ±15°
            const base = 0.8;
            const speed = base * Math.sqrt(Math.random());
            const vx = Math.cos(angle) * speed * 0.8; // 横向更弱
            const vy = Math.sin(angle) * speed; // 负值，向上

            this.hitEffects.push({
                x, y, vx, vy,
                life: 1.5,        // 短生命，立即释放
                decay: 0.02 + Math.random() * 0.02,
                size: (this.laneWidth/2-5) + Math.random() * 7,
                color
            });
        }
        // 中心向上闪光（小型）
        this.hitEffects.push({
            x, y, vx: -0.2, vy: 0, life: 10, decay: 0.6, size: Math.random()*10, color, isExplosion: true
        });
    }

    updateHitEffects() {
        // 更新并立即清理
        const next = [];
        for (let i = 0; i < this.hitEffects.length; i++) {
            const e = this.hitEffects[i];
            e.x += e.vx;
            e.y += e.vy;
            e.vy += 0.03; // 轻微重力
            e.life -= e.decay;
            if (e.isExplosion) e.size *= 0.9; else e.size *= 0.92;
            // 出界或生命完结立即释放
            if (e.life > 0 && e.y > 30 && e.y < this.height + 30) {
                next.push(e);
            }
        }
        // 丢掉所有已死引用（有助于GC）
        this.hitEffects = next;
    }

    drawHitEffects() {
        // 最底层（在render中先于轨道和物件绘制）
        for (const e of this.hitEffects) {
            if (e.isExplosion) {
                const g = this.ctx.createRadialGradient(e.x, e.y, 100, e.x, e.y, e.size);
                g.addColorStop(0, this.setAlpha(e.color, e.life * 0.6,e.opacity=0.6));
                g.addColorStop(1, this.setAlpha(e.color, 0));
                this.ctx.fillStyle = g;
                this.ctx.beginPath(); this.ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2); this.ctx.fill();
            } else {
                this.ctx.fillStyle = this.setAlpha(e.color, e.life);
                this.ctx.beginPath(); this.ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2); this.ctx.fill();
            }
        }
    }

    drawJudgmentLine() {
        const totalWidth = this.laneWidth * this.laneCount;
        const startX = (this.width - totalWidth) / 2;
        this.ctx.shadowBlur = 12; this.ctx.shadowColor = '#FFD700';
        const gradient = this.ctx.createLinearGradient(startX, 0, startX + totalWidth, 0);
        gradient.addColorStop(0, 'rgba(255,215,0,0.5)');
        gradient.addColorStop(0.5, 'rgba(255,215,0,1)');
        gradient.addColorStop(1, 'rgba(255,215,0,0.5)');
        this.ctx.strokeStyle = gradient; this.ctx.lineWidth = 4;
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
        this.ctx.fillText(`Time: ${(this.currentTime/1000).toFixed(2)}s`, pad+10, pad+25);
        this.ctx.fillText(`FPS: ${this.fps}`, pad+10, pad+45);
        this.ctx.fillText(`Combo: ${this.stats.combo || 0}`, pad+110, pad+25);
        this.ctx.fillText(`Score: ${this.stats.score || 0}`, pad+110, pad+45);
        this.ctx.fillText(`Acc: ${(this.stats.acc || 100).toFixed(2)}%`, pad+110, pad+65);
    }

    updateFPS() {
        this.frameCount++;
        const now = Date.now();
        if (now - this.lastFpsUpdate >= 1000) {
            this.fps = this.frameCount; this.frameCount = 0; this.lastFpsUpdate = now;
        }
    }

    adjustBrightness(color, amount) {
        const hex = color.replace('#', '');
        const r = Math.max(0, Math.min(255, parseInt(hex.substr(0,2),16)+amount));
        const g = Math.max(0, Math.min(255, parseInt(hex.substr(2,2),16)+amount));
        const b = Math.max(0, Math.min(255, parseInt(hex.substr(4,2),16)+amount));
        return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
    }
    setAlpha(color, alpha) {
        const hex = color.replace('#','');
        const r = parseInt(hex.substr(0,2),16);
        const g = parseInt(hex.substr(2,2),16);
        const b = parseInt(hex.substr(4,2),16);
        return `rgba(${r},${g},${b},${alpha})`;
    }
}
