// @ts-nocheck
// 游戏渲染器 - 使用 Worker 处理粒子 - TypeScript版本

import type { Beatmap } from "./beatmapParser.js";

interface AmbientParticle {
  x: number;
  y: number;
  r: number;
  alpha: number;
  vx: number;
  vy: number;
}

interface HitEffectParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  size: number;
  color: string;
  isExplosion?: boolean;
}

export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;

  private beatmap: Beatmap | null = null;
  private currentTime: number = 0;
  private scrollSpeed: number = 800;
  private showSV: boolean = true;
  private showKeyGroup: boolean = true;
  private useBPMScaling: boolean = false;
  private measureOffset: number = 0; // 小节线偏移量（毫秒）

  private laneWidth: number = 120;
  private laneCount: number = 4;
  private judgmentLineY: number = 0;

  private visibleLeadTime: number = 5000;
  private visibleTrail: number = 46;

  private bgImage: HTMLImageElement | null = null;
  private bgReady: boolean = false;
  private bgAlpha: number = 0.15;

  private ambientParticles: AmbientParticle[] = [];
  private hitEffects: HitEffectParticle[] = [];
  private ambientCount: number = 160;

  private pressedLanes: Set<number> = new Set();

  private keyGroupColors: string[] = [
    //new experimental keygroup color
    // "#FF6B6B", // 红色
    // "#81C784", // 绿色（红色的反色区域）
    // "#45B7D1", // 蓝色
    // "#FFB74D", // 橙黄色（蓝色的反色区域）
    // "#98D8C8", // 浅青色
    // "#F06292", // 粉红色（青色的反色区域）
    // "#BB8FCE", // 紫色
    // "#FFD54F", // 金黄色（紫色的反色区域）
    // "#4ECDC4", // 青色
    // "#E57373", // 浅红色（青色的反色区域）
    // "#FFA07A", // 橙色
    // "#64B5F6", // 天蓝色（橙色的反色区域）
    // "#D4B85A", // 暗黄色
    // "#7986CB", // 靛蓝色（黄色的反色区域）
    // "#85C1E2", // 浅蓝色
    // "#FF8A65", // 橙红色（浅蓝色的反色区域）
    // "#BA68C8", // 紫红色
    // "#AED581", // 浅绿色（紫红色的反色区域）
    // "#4DB6AC", // 青绿色
    // "#FF9800", // 橙色（青绿色的反色区域）
    // "#4FC3F7", // 亮蓝色
    // "#9575CD", // 深紫色（亮蓝色的反色区域）
    // "#4DD0E1", // 亮青色
    // "#A1887F", // 棕色（亮青色的反色区域）
    // "#90A4AE", // 蓝灰色
    // "#FFF176", // 亮黄色（蓝灰色的反色区域）
    // "#81D4FA", // 淡蓝色
    // "#CE93D8", // 淡紫色（淡蓝色的反色区域）
    // "#80CBC4", // 薄荷色
    // "#9FA8DA", // 淡靛色（薄荷色的反色区域）
    // "#F48FB1", // 淡粉色
    // "#C5E1A5", // 淡绿色（淡粉色的反色区域）
    // "#80DEEA", // 淡青色
    // "#FFCC80", // 淡橙色（淡青色的反色区域）
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
    "#FFA07A",
    "#98D8C8",
    "#F7DC6F",
    "#BB8FCE",
    "#85C1E2",
  ];

  private stats: {
    score: number;
    combo: number;
    acc: number;
    judgements: Record<string, number>;
  } = { score: 0, combo: 0, acc: 100, judgements: {} };

  private fps: number = 0;
  private frameCount: number = 0;
  private lastFpsUpdate: number = Date.now();

  private particleWorker: Worker | null = null;

  private _lastFrameTime: number = performance.now();
  private _accum: number = 0;
  private pendingTasks: any[] = [];

  // 独立渲染循环属性
  private disableVsync: boolean = false;
  private renderLoopId: number | null = null;
  private targetFPS: number = 360; // 默认目标帧率
  private lastRenderTime: number = 0;
  private renderAccumulator: number = 0;
  private fixedTimeStep: number = 1 / 60; // 用于粒子更新的固定时间步长
  private isRendering: boolean = false;

  private width: number = 0;
  private height: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.offscreenCanvas = document.createElement("canvas");
    this.offscreenCtx = this.offscreenCanvas.getContext("2d")!;

    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());

    // 初始化 Worker
    this.initWorker();

    this._lastFrameTime = performance.now();
    this._accum = 0;
    this.pendingTasks = [];

    // 默认启用BPM变速混合
    this.useBPMScaling = true;
  }

  private initWorker(): void {
    try {
      this.particleWorker = new Worker(
        new URL("./particleWorker.ts", import.meta.url),
      );
      this.particleWorker.onmessage = (e: MessageEvent) => {
        const { type, data } = e.data;
        switch (type) {
          case "ambientInit":
          case "ambientUpdate":
            this.ambientParticles = data;
            break;
          case "hitCreate":
          case "hitUpdate":
            this.hitEffects = data;
            break;
        }
      };

      // 初始化环境粒子
      this.particleWorker.postMessage({
        type: "initAmbient",
        data: {
          count: this.ambientCount,
          width: this.width,
          height: this.height,
        },
      });
    } catch (e) {
      console.warn("Worker initialization failed, using fallback", e);
      this.initAmbientParticles(); // 降级方案
    }
  }

  // 异步创建打击特效
  async createHitEffect(column: number, keyGroupColor: string): Promise<void> {
    const totalWidth = this.laneWidth * this.laneCount;
    const startX = Math.random() * 10 + (this.width - totalWidth) / 2;
    const x = startX + column * this.laneWidth + this.laneWidth / 2;
    const y = this.judgmentLineY;
    // 确保颜色有效，如果无效则使用默认白色
    const color = this.isValidColor(keyGroupColor) ? keyGroupColor : "#FFFFFF";
    if (this.particleWorker) {
      // 使用 Worker
      return new Promise((resolve) => {
        this.particleWorker!.postMessage({
          type: "createHit",
          data: { x, y, color, laneWidth: this.laneWidth },
        });
        resolve();
      });
    } else {
      // 降级：直接创建
      return this.createHitEffectFallback(column, keyGroupColor);
    }
  }
  // 检查颜色是否有效
  private isValidColor(color: string | undefined | null): boolean {
    if (!color || typeof color !== "string") {
      return false;
    }
    // 检查是否是有效的十六进制颜色
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    return hexRegex.test(color);
  }
  // 降级方案：直接创建粒子
  async createHitEffectFallback(
    column: number,
    keyGroupColor: string,
  ): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const totalWidth = this.laneWidth * this.laneCount;
        const startX = Math.random() * 10 + (this.width - totalWidth) / 2;
        const x = startX + column * this.laneWidth + this.laneWidth / 2;
        const y = this.judgmentLineY;
        const color = keyGroupColor || "#FFFFFF";
        const particleCount = 30;
        for (let i = 0; i < particleCount; i++) {
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 2);
          const base = 0.8;
          const speed = base * Math.sqrt(Math.random());
          const vx = Math.cos(angle) * speed * 0.8;
          const vy = Math.sin(angle) * speed;
          this.hitEffects.push({
            x,
            y,
            vx,
            vy,
            life: 1.5,
            decay: 0.02 + Math.random() * 0.02,
            size: this.laneWidth / 2 - 5 + Math.random() * 7,
            color,
          });
        }
        this.hitEffects.push({
          x,
          y,
          vx: -0.2,
          vy: 0,
          life: 10,
          decay: 0.6,
          size: Math.random() * 10,
          color,
          isExplosion: true,
        });
        resolve();
      }, 0);
    });
  }

  resizeCanvas(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + "px";
    this.canvas.style.height = rect.height + "px";
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

  setBeatmap(beatmap: Beatmap): void {
    this.beatmap = beatmap;
  }

  // 设置小节线偏移量
  setMeasureOffset(offset: number): void {
    this.measureOffset = offset;
  }

  // 获取小节线偏移量
  getMeasureOffset(): number {
    return this.measureOffset;
  }

  setScrollSpeed(speed: number): void {
    this.scrollSpeed = Math.max(200, speed * 40);
  }

  setShowSV(show: boolean): void {
    this.showSV = show;
  }

  setShowKeyGroup(show: boolean): void {
    this.showKeyGroup = show;
  }

  setUseBPMScaling(use: boolean): void {
    this.useBPMScaling = use;
  }

  setStats(stats: any): void {
    this.stats = stats;
  }

  setPressedLanes(set: Set<number>): void {
    this.pressedLanes = new Set(set);
  }

  async setBackgroundImageBlob(blob: Blob | null): Promise<void> {
    if (!blob) {
      this.bgImage = null;
      this.bgReady = false;
      return;
    }
    const url = URL.createObjectURL(blob);
    await this.setBackgroundImageURL(url);
  }

  setBackgroundImageURL(url: string): Promise<void> {
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

  svAreaAt(t: number): number {
    const segs = this.beatmap?.svSegments || [];
    const areas = this.beatmap?.svCumAreas || [];
    if (!segs.length) return t;
    let idx = 0,
      lo = 0,
      hi = segs.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const s = segs[mid];
      if (t < s.start) hi = mid - 1;
      else if (s.end !== Infinity && t >= s.end) lo = mid + 1;
      else {
        idx = mid;
        break;
      }
    }
    const seg = segs[idx];
    const base = areas[idx] || 0;
    const end = seg.end === Infinity ? t : seg.end;
    const clampedT = Math.max(seg.start, Math.min(t, end));
    return base + seg.sv * (clampedT - seg.start);
  }

  // 计算BPM+SV混合下的累计面积（ms * multiplier）
  combinedAreaAt(t: number): number {
    const segs = this.beatmap?.combinedSegments || [];
    const areas = this.beatmap?.combinedCumAreas || [];
    if (!segs.length) return t;
    let idx = 0,
      lo = 0,
      hi = segs.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const s = segs[mid];
      if (t < s.start) hi = mid - 1;
      else if (s.end !== Infinity && t >= s.end) lo = mid + 1;
      else {
        idx = mid;
        break;
      }
    }
    const seg = segs[idx];
    const base = areas[idx] || 0;
    const end = seg.end === Infinity ? t : seg.end;
    const clampedT = Math.max(seg.start, Math.min(t, end));
    return base + seg.sv * (clampedT - seg.start);
  }

  noteYAt(time: number): number {
    const k = this.scrollSpeed / 1000;
    if (
      !this.showSV ||
      (!this.beatmap?.svSegments?.length &&
        !this.beatmap?.combinedSegments?.length)
    ) {
      const dt = time - this.currentTime;
      return this.judgmentLineY - k * dt;
    }
    // 使用BPM+SV混合或纯SV积分
    const areaFunc = this.useBPMScaling ? this.combinedAreaAt : this.svAreaAt;
    const aNote = areaFunc.call(this, time);
    const aNow = areaFunc.call(this, this.currentTime);
    return this.judgmentLineY - k * (aNote - aNow);
  }

  initAmbientParticles(): void {
    this.ambientParticles = [];
    for (let i = 0; i < this.ambientCount; i++) {
      this.ambientParticles.push(this.makeAmbientParticle());
    }
  }

  makeAmbientParticle(): AmbientParticle {
    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      r: 1.5 + Math.random() * 2.5,
      alpha: 0.1 + Math.random() * 0.15,
      vx: (Math.random() - 0.5) * 0.15,
      vy: -0.05 - Math.random() * 0.35,
    };
  }

  updateAmbientParticles(): void {
    if (this.particleWorker) {
      // 使用 Worker 更新
      this.particleWorker.postMessage({
        type: "updateAmbient",
        data: { width: this.width, height: this.height },
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
          p.alpha = 0.1 + Math.random() * 0.15;
        }
        if (p.x < -10 || p.x > this.width + 10) {
          p.vx *= -1;
        }
      }
    }
  }

  drawAmbientParticles(): void {
    // 绘制一个红色测试矩形
    this.ctx.save();
    this.ctx.fillStyle = "red";
    this.ctx.globalAlpha = 0.5;
    this.ctx.fillRect(10, 10, 50, 50);
    this.ctx.restore();
    if (this.ambientParticles.length === 0) {
      console.warn("WARNING: ambientParticles array is empty!");
      // 创建测试粒子用于调试
      this.ambientParticles = [
        {
          x: this.width * 0.25,
          y: this.height * 0.25,
          r: 3,
          alpha: 0.5,
          vx: 0,
          vy: 0,
        },
        {
          x: this.width * 0.5,
          y: this.height * 0.5,
          r: 3,
          alpha: 0.5,
          vx: 0,
          vy: 0,
        },
        {
          x: this.width * 0.75,
          y: this.height * 0.75,
          r: 3,
          alpha: 0.5,
          vx: 0,
          vy: 0,
        },
      ];
    }
    let drawnCount = 0;
    for (const p of this.ambientParticles) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") {
        console.warn("Invalid particle data:", p);
        continue;
      }
      this.ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      this.ctx.fill();
      drawnCount++;
    }
  }

  async render(currentTime: number): Promise<void> {
    this.currentTime = currentTime;

    // 如果启用了独立渲染循环，不执行绘制逻辑
    if (this.disableVsync && this.isRendering) {
      return;
    }

    this.drawBackgroundBase();
    this.drawAmbientParticles();
    this.drawBlurOverlay();
    this.drawLanes();
    this.drawHitObjects();
    this.drawMeasures();
    this.drawHitEffects();

    const now = performance.now();
    let dt = (now - this._lastFrameTime) / 1000;
    this._lastFrameTime = now;
    dt = Math.min(dt, 0.05);
    this._accum += dt;
    const step = 1 / 100;
    while (this._accum >= step) {
      await this.updateHitEffects();
      await this.updateAmbientParticles();
      this._accum -= step;
    }

    this.drawJudgmentLine();
    this.drawHUD();
    this.updateFPS();
  }

  updateHitEffects(): void {
    if (this.particleWorker) {
      // 使用 Worker 更新
      this.particleWorker.postMessage({
        type: "updateHit",
        data: { height: this.height },
      });
    } else {
      // 降级方案
      const next: HitEffectParticle[] = [];
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

  drawHitEffects(): void {
    if (this.hitEffects.length === 0) {
      return;
    }
    let drawnCount = 0;
    for (const e of this.hitEffects) {
      if (!e || typeof e.x !== "number" || typeof e.y !== "number") {
        console.warn("Invalid hit effect data:", e);
        continue;
      }
      if (e.isExplosion) {
        const g = this.ctx.createRadialGradient(
          e.x,
          e.y,
          100,
          e.x,
          e.y,
          e.size,
        );
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
      drawnCount++;
    }
  }

  drawBackgroundBase(): void {
    const g = this.ctx.createLinearGradient(0, 0, 0, this.height);
    g.addColorStop(0, "#0f0f1a");
    g.addColorStop(1, "#0b0b16");
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, this.width, this.height);
    if (this.bgReady && this.bgImage) {
      const img = this.bgImage;
      const iw = img.width,
        ih = img.height;
      const scale = Math.max(this.width / iw, this.height / ih);
      const drawW = iw * scale,
        drawH = ih * scale;
      const dx = (this.width - drawW) / 2;
      const dy = (this.height - drawH) / 2;
      this.ctx.globalAlpha = this.bgAlpha;
      this.ctx.drawImage(img, dx, dy, drawW, drawH);
      this.ctx.globalAlpha = 1.0;
    }
  }

  drawBlurOverlay(): void {
    this.ctx.save();
    this.ctx.filter = "blur(4px)";
    const haze = this.ctx.createLinearGradient(0, 0, 0, this.height);
    haze.addColorStop(0, "rgba(0,0,0,0.08)");
    haze.addColorStop(1, "rgba(0,0,0,0.18)");
    this.ctx.fillStyle = haze;
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.restore();
  }

  drawLanes(): void {
    const totalWidth = this.laneWidth * this.laneCount;
    const startX = (this.width - totalWidth) / 2;
    this.ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < this.laneCount; i += 2) {
      this.ctx.fillRect(
        startX + i * this.laneWidth,
        0,
        this.laneWidth,
        this.height,
      );
    }
    this.ctx.strokeStyle = "rgba(255,255,255,0.3)";
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
        this.ctx.fillStyle = "rgba(255,255,255,0.08)";
        this.ctx.fillRect(x, this.judgmentLineY - 80, this.laneWidth, 160);
      }
    }
  }

  drawHitObjects(): void {
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

    const calcAlpha = (hitTime: number): number => {
      const timeToHit = hitTime - this.currentTime;
      let alpha: number;
      if (timeToHit <= fadeEarly) {
        const fadeProgress =
          (fadeEarly - timeToHit) / (fadeEarly + this.visibleTrail);
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

      // 调试：检查 keyGroup 值
      if (typeof obj.keyGroup === "undefined") {
        console.warn("drawHitObjects: obj.keyGroup is undefined", obj);
      }

      const color =
        this.showKeyGroup &&
        this.keyGroupColors &&
        this.keyGroupColors.length > 0
          ? this.keyGroupColors[
              Math.abs(obj.keyGroup || 0) % this.keyGroupColors.length
            ]
          : "#FFFFFF";

      // 调试：检查最终颜色值
      if (!color || typeof color !== "string") {
        console.error("drawHitObjects: Invalid color calculated", {
          showKeyGroup: this.showKeyGroup,
          keyGroupColors: this.keyGroupColors,
          keyGroupColorsLength: this.keyGroupColors?.length,
          objKeyGroup: obj.keyGroup,
          calculatedColor: color,
        });
      }

      if (obj.isLongNote) {
        const headY = this.noteYAt(obj.time);
        const tailY = this.noteYAt(obj.endTime);
        const visibleHeadY = Math.min(headY, this.judgmentLineY);
        const visibleTailY = Math.min(tailY, this.judgmentLineY);
        const bodyTop = Math.max(Math.min(visibleHeadY, visibleTailY), 0);
        const bodyBottom = Math.min(
          Math.max(visibleHeadY, visibleTailY),
          this.judgmentLineY,
        );
        const bodyLen = Math.max(0, bodyBottom - bodyTop);
        if (bodyLen > 0) {
          const grad = this.ctx.createLinearGradient(
            x + 5,
            bodyTop,
            x + 5,
            bodyBottom,
          );
          grad.addColorStop(0, this.setAlpha(color, 0.35));
          grad.addColorStop(1, this.setAlpha(color, 0.6));
          this.ctx.fillStyle = grad;
          this.ctx.fillRect(x + 5, bodyTop, noteWidth, bodyLen);
          this.ctx.strokeStyle = this.setAlpha(color, 0.9);
          this.ctx.lineWidth = 2;
          this.ctx.strokeRect(x + 5, bodyTop, noteWidth, bodyLen);
        }
        if (headY >= 0 && headY < this.judgmentLineY) {
          this.drawNoteRect(
            x,
            headY,
            noteWidth,
            noteHeight,
            color,
            calcAlpha(obj.time),
          );
        }
        if (tailY >= 0 && tailY < this.judgmentLineY) {
          this.drawNoteRect(
            x,
            tailY,
            noteWidth,
            noteHeight * 0.3,
            this.adjustBrightness(color, -20),
            calcAlpha(obj.endTime),
          );
        }
      } else {
        const y = this.noteYAt(obj.time);
        if (y < 0 || y > this.judgmentLineY) continue;
        this.drawNoteRect(
          x,
          y,
          noteWidth,
          noteHeight,
          color,
          calcAlpha(obj.time),
        );
      }
    }
    this.ctx.restore();
  }

  drawNoteRect(
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    alphaFactor: number = 1.0,
  ): void {
    const distance = Math.abs(y - this.judgmentLineY);
    const baseAlpha = Math.max(0.35, 1 - (distance / this.height) * 0.5);
    const alpha = Math.max(0, Math.min(1, baseAlpha * alphaFactor));
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = color;
    const grad = this.ctx.createLinearGradient(x, y - h / 2, x, y + h / 2);
    grad.addColorStop(0, this.setAlpha(color, alpha));
    grad.addColorStop(
      1,
      this.setAlpha(this.adjustBrightness(color, -30), alpha),
    );
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(x + 5, y - h / 2, w, h);
    this.ctx.strokeStyle = this.setAlpha(
      this.adjustBrightness(color, 40),
      alpha,
    );
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x + 5, y - h / 2, w, h);
    this.ctx.shadowBlur = 0;
  }

  drawJudgmentLine(): void {
    const totalWidth = this.laneWidth * this.laneCount;
    const startX = (this.width - totalWidth) / 2;
    this.ctx.shadowBlur = 12;
    this.ctx.shadowColor = "#FFD700";
    const gradient = this.ctx.createLinearGradient(
      startX,
      0,
      startX + totalWidth,
      0,
    );
    gradient.addColorStop(0, "rgba(255,215,0,0.5)");
    gradient.addColorStop(0.5, "rgba(255,215,0,1)");
    gradient.addColorStop(1, "rgba(255,215,0,0.5)");
    this.ctx.strokeStyle = gradient;
    this.ctx.lineWidth = 4;
    this.ctx.beginPath();
    this.ctx.moveTo(startX - 10, this.judgmentLineY);
    this.ctx.lineTo(startX + totalWidth + 10, this.judgmentLineY);
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
  }

  drawHUD(): void {
    const pad = 10;
    this.ctx.fillStyle = "rgba(0,0,0,0.5)";
    this.ctx.fillRect(pad, pad, 220, 100);
    this.ctx.fillStyle = "#FFF";
    this.ctx.font = "14px monospace";
    this.ctx.fillText(
      `Time: ${(this.currentTime / 1000).toFixed(2)}s`,
      pad + 10,
      pad + 25,
    );
    this.ctx.fillText(`FPS: ${this.fps}`, pad + 10, pad + 45);
    this.ctx.fillText(`Combo: ${this.stats.combo || 0}`, pad + 110, pad + 25);
    this.ctx.fillText(`Score: ${this.stats.score || 0}`, pad + 110, pad + 45);
    this.ctx.fillText(
      `Acc: ${(this.stats.acc || 100).toFixed(2)}%`,
      pad + 110,
      pad + 65,
    );
  }

  updateFPS(): void {
    this.frameCount++;
    const now = Date.now();
    if (now - this.lastFpsUpdate >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }
  }

  adjustBrightness(color: string, amount: number): string {
    // 添加空值检查，如果color为空或undefined，使用默认颜色
    if (!color || typeof color !== "string") {
      console.warn(
        "adjustBrightness: Invalid color provided, using default white",
        color,
      );
      return "#FFFFFF";
    }

    const hex = color.replace("#", "");

    // 确保hex是有效的6位十六进制颜色
    if (hex.length !== 6) {
      console.warn(
        "adjustBrightness: Invalid hex color length, using default white",
        color,
      );
      return "#FFFFFF";
    }

    const r = Math.max(
      0,
      Math.min(255, parseInt(hex.substr(0, 2), 16) + amount),
    );
    const g = Math.max(
      0,
      Math.min(255, parseInt(hex.substr(2, 2), 16) + amount),
    );
    const b = Math.max(
      0,
      Math.min(255, parseInt(hex.substr(4, 2), 16) + amount),
    );
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  setAlpha(color: string, alpha: number): string {
    // 添加空值检查，如果color为空或undefined，使用默认颜色
    if (!color || typeof color !== "string") {
      console.warn(
        "setAlpha: Invalid color provided, using default white. Color was:",
        color,
        "Stack trace:",
        new Error().stack,
      );
      return `rgba(255,255,255,${alpha})`;
    }

    const hex = color.replace("#", "");
    // 确保hex是有效的6位十六进制颜色
    if (hex.length !== 6) {
      console.warn(
        "setAlpha: Invalid hex color length, using default white. Color was:",
        color,
        "Hex length:",
        hex.length,
      );
      return `rgba(255,255,255,${alpha})`;
    }

    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    // 检查解析结果是否有效
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
      console.warn(
        "setAlpha: Failed to parse color, using default white. Color was:",
        color,
        "Hex:",
        hex,
      );
      return `rgba(255,255,255,${alpha})`;
    }

    return `rgba(${r},${g},${b},${alpha})`;
  }

  drawMeasures(): void {
    if (!this.beatmap || !this.beatmap.measures) return;
    const totalWidth = this.laneWidth * this.laneCount;
    const startX = (this.width - totalWidth) / 2;
    this.ctx.strokeStyle = "rgba(134,156,232,0.71)";
    this.ctx.lineWidth = 1;
    for (const measureTime of this.beatmap.measures) {
      // 应用小节线offset
      const adjustedMeasureTime = measureTime + this.measureOffset;
      const y = this.noteYAt(adjustedMeasureTime);
      if (y > this.judgmentLineY) continue;
      this.ctx.beginPath();
      this.ctx.moveTo(startX, y);
      this.ctx.lineTo(startX + totalWidth, y);
      this.ctx.stroke();
    }
  }

  clearHitEffects(): void {
    this.hitEffects = [];
    if (this.particleWorker) {
      this.particleWorker.postMessage({
        type: "clearHit",
      });
    }
  }

  dispose(): void {
    if (this.particleWorker) {
      this.particleWorker.terminate();
    }
    this.stopIndependentRenderLoop();
  }

  // 设置是否禁用垂直同步
  setDisableVsync(enabled: boolean): void {
    if (this.disableVsync === enabled) return;

    this.disableVsync = enabled;
    if (enabled) {
      // 启用独立渲染循环
      this.startIndependentRenderLoop();
    } else {
      // 禁用独立渲染循环，恢复原来的render调用模式
      this.stopIndependentRenderLoop();
    }
  }

  // 启动独立渲染循环
  startIndependentRenderLoop(): void {
    if (this.isRendering || this.renderLoopId !== null) return;

    this.isRendering = true;
    this.lastRenderTime = performance.now();
    this.renderAccumulator = 0;

    const renderLoop = () => {
      if (!this.isRendering) return;

      const currentTime = performance.now();
      const deltaTime = (currentTime - this.lastRenderTime) / 1000;
      this.lastRenderTime = currentTime;

      // 限制deltaTime防止螺旋死亡
      const fixedDeltaTime = Math.min(deltaTime, 0.1);

      // 累积时间用于固定时间步长更新
      this.renderAccumulator += fixedDeltaTime;

      // 使用固定时间步长更新粒子（保持恒定）
      while (this.renderAccumulator >= this.fixedTimeStep) {
        this.updateAmbientParticles();
        this.updateHitEffects();
        this.renderAccumulator -= this.fixedTimeStep;
      }

      // 执行渲染（不使用插值）
      this.renderFrame();

      // 检查是否应该渲染下一帧（基于目标帧率）
      const targetFrameTime = 1000 / this.targetFPS;
      const elapsed = performance.now() - currentTime;

      if (elapsed >= targetFrameTime) {
        // 已经超过目标帧时间，立即执行下一帧（使用微任务避免阻塞）
        Promise.resolve().then(() => {
          if (this.isRendering) {
            this.renderLoopId = requestAnimationFrame(renderLoop);
          }
        });
      } else {
        // 还没到目标帧时间，使用requestAnimationFrame安排
        this.renderLoopId = requestAnimationFrame(renderLoop);
      }
    };

    // 启动循环
    renderLoop();
  }

  // 停止独立渲染循环
  stopIndependentRenderLoop(): void {
    this.isRendering = false;
    if (this.renderLoopId !== null) {
      cancelAnimationFrame(this.renderLoopId);
      this.renderLoopId = null;
    }
  }

  // 独立渲染循环的渲染帧
  private renderFrame(): void {
    // 保存当前上下文状态
    this.ctx.save();

    // 清除画布
    this.ctx.clearRect(0, 0, this.width, this.height);

    // 绘制所有元素
    this.drawBackgroundBase();
    this.drawAmbientParticles();
    this.drawBlurOverlay();
    this.drawLanes();

    // 绘制音符（使用原有方法）
    this.drawHitObjects();

    this.drawMeasures();
    this.drawHitEffects();
    this.drawJudgmentLine();
    this.drawHUD();
    this.updateFPS();

    // 恢复上下文状态
    this.ctx.restore();
  }

  // 带插值的音符绘制
  private drawHitObjectsWithInterpolation(alpha: number): void {
    if (!this.beatmap) return;

    const objs = this.beatmap.hitObjects;
    const totalWidth = this.laneWidth * this.laneCount;
    const startX = (this.width - totalWidth) / 2;
    const noteWidth = this.laneWidth - 4;
    const noteHeight = 24;
    const fadeEarly = 200;

    // 计算插值后的时间
    const interpolatedTime = this.currentTime + (alpha * 1000) / 60;

    for (const obj of objs) {
      const lastTime = obj.isLongNote ? obj.endTime : obj.time;
      if (lastTime < interpolatedTime - this.visibleTrail) continue;
      if (obj.time > interpolatedTime + this.visibleLeadTime) continue;

      const x = startX + obj.column * this.laneWidth;
      const color =
        this.showKeyGroup &&
        this.keyGroupColors &&
        this.keyGroupColors.length > 0
          ? this.keyGroupColors[
              Math.abs(obj.keyGroup || 0) % this.keyGroupColors.length
            ]
          : "#FFFFFF";

      if (obj.isLongNote) {
        const headY = this.noteYAtWithInterpolation(obj.time, alpha);
        const tailY = this.noteYAtWithInterpolation(obj.endTime, alpha);

        // 确保头部在上方
        const bodyTop = Math.min(headY, tailY);
        const bodyBottom = Math.max(headY, tailY);
        const bodyLen = Math.max(2, bodyBottom - bodyTop);

        // 绘制长按音符主体
        const grad = this.ctx.createLinearGradient(x, bodyTop, x, bodyBottom);
        grad.addColorStop(0, this.adjustBrightness(color, 1.4));
        grad.addColorStop(0.5, color);
        grad.addColorStop(1, this.adjustBrightness(color, 0.6));

        this.ctx.fillStyle = grad;
        this.ctx.fillRect(x + 2, bodyTop, noteWidth, bodyLen);

        // 绘制头部
        this.drawNoteRect(headY, x, noteWidth, noteHeight, color, true);

        // 绘制尾部
        this.drawNoteRect(tailY, x, noteWidth, noteHeight, color, false);
      } else {
        const y = this.noteYAtWithInterpolation(obj.time, alpha);
        this.drawNoteRect(y, x, noteWidth, noteHeight, color, false);
      }
    }
  }

  // 带插值的时间到Y坐标转换
  private noteYAtWithInterpolation(time: number, alpha: number): number {
    const interpolatedTime = this.currentTime + (alpha * 1000) / 60;
    const k = this.scrollSpeed / 1000;

    if (
      !this.showSV ||
      (!this.beatmap?.svSegments?.length &&
        !this.beatmap?.combinedSegments?.length)
    ) {
      const dt = time - interpolatedTime;
      return this.judgmentLineY - k * dt;
    }

    // 使用BPM+SV混合或纯SV积分
    const areaFunc = this.useBPMScaling ? this.combinedAreaAt : this.svAreaAt;
    const aNote = areaFunc.call(this, time);
    const aNow = areaFunc.call(this, interpolatedTime);
    return this.judgmentLineY - k * (aNote - aNow);
  }

  // 设置目标帧率
  setTargetFPS(fps: number): void {
    this.targetFPS = Math.max(30, Math.min(500, fps)); // 限制在30-500fps之间
  }
}
