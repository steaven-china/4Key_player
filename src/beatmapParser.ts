// Beatmap解析器（修复SV与积分） - TypeScript版本

export interface TimingPoint {
    time: number;
    beatLength: number;
    meter: number;
    uninherited: boolean;
}

export interface HitObject {
    x: number;
    time: number;
    type: number;
    isLongNote: boolean;
    endTime: number;
    column: number;
    keyGroup: number;
    judgedHead?: boolean;
    judgedTail?: boolean;
}

export interface SVSegment {
    start: number;
    end: number;
    sv: number;
}

export interface Beatmap {
    metadata: Record<string, string>;
    general: Record<string, string>;
    difficulty: Record<string, number | string>;
    timingPoints: TimingPoint[];
    rawTimingPointsForSV?: TimingPoint[];
    hitObjects: HitObject[];
    keyCount: number;
    svSegments: SVSegment[];
    svCumAreas: number[];
    combinedSegments: SVSegment[];
    combinedCumAreas: number[];
    measures?: number[];
}

export class BeatmapParser {
    private beatmap: Beatmap | null = null;

    constructor() {
        this.beatmap = null;
    }

    parse(content: string): Beatmap {
        const lines = content.split('\n');
        const beatmap: Beatmap = {
            metadata: {},
            general: {},
            difficulty: {},
            timingPoints: [], // 确保 timingPoints 是一个空数组
            hitObjects: [],
            keyCount: 0,
            svSegments: [],       // SV分段
            svCumAreas: [],        // 每段起点的累计面积（ms * sv）
            combinedSegments: [],   // BPM+SV混合分段
            combinedCumAreas: []    // 混合累计面积
        };

        let currentSection = '';

        for (let line of lines) {
            line = line.trim();
            if (line.startsWith('[') && line.endsWith(']')) {
                currentSection = line.slice(1, -1);
                continue;
            }
            if (line === '' || line.startsWith('//')) continue;

            switch (currentSection) {
                case 'General':
                    this.parseKeyValue(line, beatmap.general);
                    break;
                case 'Metadata':
                    this.parseKeyValue(line, beatmap.metadata);
                    break;
                case 'Difficulty':
                    this.parseDifficulty(line, beatmap.difficulty);
                    break;
                case 'TimingPoints':
                    this.parseTimingPoint(line, beatmap.timingPoints); // 直接使用 beatmap.timingPoints
                    break;
                case 'HitObjects':
                    this.parseHitObject(line, beatmap.hitObjects);
                    break;
            }
        }

        // 在对齐前保存一份原始TP（保留负SV用）
        const rawTP = beatmap.timingPoints.map(tp => ({ ...tp }));

        // 对齐 timingPoints 时间（不再用于SV，仅用于小节线和可能的显示）
        this.alignTimingPoints(beatmap.timingPoints);

        // 保存原始TP供SV积分用
        beatmap.rawTimingPointsForSV = rawTP;

        // 解析小节时间点（只按红点分段）
        this.calculateMeasures(beatmap);

        // 键数与列号
        beatmap.keyCount = this.calculateKeyCount(beatmap.hitObjects);
        if (beatmap.keyCount !== 4) {
            beatmap.hitObjects = this.convertTo4Key(beatmap.hitObjects, beatmap.keyCount);
            beatmap.keyCount = 4;
        } else {
            for (const obj of beatmap.hitObjects) {
                obj.column = Math.floor(obj.x * 4 / 512);
            }
        }

        // 键组
        this.calculateKeyGroups(beatmap.hitObjects);

        // 构建SV分段与累计积分（用于正确下落位置计算）
        this.buildSVSegments(beatmap);

        this.beatmap = beatmap;
        return beatmap;
    }

    private parseKeyValue(line: string, target: Record<string, string>): void {
        const [key, ...rest] = line.split(':');
        if (!key) return;
        const value = rest.join(':').trim();
        if (value !== '') target[key.trim()] = value.trim();
    }

    private parseDifficulty(line: string, difficulty: Record<string, number | string>): void {
        const [key, ...rest] = line.split(':');
        if (!key) return;
        const raw = rest.join(':').trim();
        const num = parseFloat(raw);
        difficulty[key.trim()] = isNaN(num) ? raw : num;
    }

    private parseTimingPoint(line: string, timingPoints: TimingPoint[]): void {
        const parts = line.split(',');
        if (parts.length >= 2) {
            const time = parseFloat(parts[0]);
            const beatLength = parseFloat(parts[1]); // 正=红点(BPM), 负=绿点(SV)
            const meter = parseInt(parts[2]) || 4;
            const uninherited = parts.length < 7 ? true : parts[6] === '1';
            timingPoints.push({
                time,
                beatLength,
                meter,
                uninherited
            });
        }
    }

    private parseHitObject(line: string, hitObjects: HitObject[]): void {
        const parts = line.split(',');
        if (parts.length >= 4) {
            const x = parseInt(parts[0], 10);
            const time = parseInt(parts[2], 10);
            const type = parseInt(parts[3], 10);
            const isLongNote = !!(type & 128);
            const obj: HitObject = {
                x,
                time,
                type,
                isLongNote,
                endTime: time,
                column: 0,
                keyGroup: 0
            };
            if (isLongNote && parts.length >= 6) {
                const endTimeStr = parts[5].split(':')[0];
                obj.endTime = parseInt(endTimeStr, 10);
            }
            hitObjects.push(obj);
        }
    }

    private calculateKeyCount(hitObjects: HitObject[]): number {
        const xs = Array.from(new Set(hitObjects.map(o => o.x)));
        return xs.length || 4;
    }

    private convertTo4Key(hitObjects: HitObject[], originalKeyCount: number): HitObject[] {
        return hitObjects.map(obj => {
            const originalColumn = Math.min(originalKeyCount - 1, Math.max(0, Math.floor(obj.x * originalKeyCount / 512)));
            const newColumn = Math.floor(originalColumn * 4 / originalKeyCount);
            return {
                ...obj,
                x: (newColumn * 512 / 4) + (512 / 8),
                column: newColumn
            };
        });
    }

    private calculateKeyGroups(hitObjects: HitObject[]): void {
        hitObjects.sort((a, b) => a.time - b.time);
        let currentGroup = 0, lastTime = -1;
        const timeThreshold = 5; // 5ms内算同组
        for (const obj of hitObjects) {
            if (obj.time - lastTime > timeThreshold) currentGroup++;
            obj.keyGroup = currentGroup;
            lastTime = obj.time;
        }
    }

    // 1. 添加 SV 范围限制（统一函数）
    private clampSV(sv: number): number {
        const MIN_SV = 0.01;  // 最小 0.01x
        const MAX_SV = 10.0;  // 最大 10.0x（可根据需要调整）

        if (sv < MIN_SV) return MIN_SV;
        if (sv > MAX_SV) return MAX_SV;
        if (!isFinite(sv) || isNaN(sv)) return 1.0;

        return sv;
    }

    // 构建SV分段并预计算累计面积（ms * sv）
    private buildSVSegments(beatmap: Beatmap): void {
        // 使用原始TP计算SV（保留负绿点）
        const tp = [...(beatmap.rawTimingPointsForSV || beatmap.timingPoints)].sort((a, b) => a.time - b.time);
        const baseSV = (beatmap.difficulty.SliderVelocity as number || 1); // 默认1

        // 收集所有可能改变SV的时间点（包括0）
        const changeTimes = [0, ...Array.from(new Set(tp.map(t => t.time)))].sort((a, b) => a - b);

        const segments: SVSegment[] = [];

        // 找到每个时间点生效的SV（最近的有效绿点，否则baseSV）
        const svAt = (time: number): number => {
            let sv = baseSV;
            for (let i = 0; i < tp.length; i++) {
                const t = tp[i];
                if (t.time > time) break;
                if (!t.uninherited) {
                    // 绿点：SV = baseSV * (-100 / beatLength)
                    const raw = t.beatLength || 1; // 保留原始符号
                    sv = baseSV * (-100 / raw);
                }
            }
            return this.clampSV(sv);  // ✅ 添加范围限制
        }

        for (let i = 0; i < changeTimes.length; i++) {
            const start = changeTimes[i];
            const end = (i < changeTimes.length - 1) ? changeTimes[i + 1] : Infinity;
            const currentSV = svAt(start);
            segments.push({ start, end, sv: currentSV });
        }

        // 合并相邻相同SV段
        const merged: SVSegment[] = [];
        for (const seg of segments) {
            const last = merged[merged.length - 1];
            if (last && last.sv === seg.sv && last.end === seg.start) {
                last.end = seg.end;
            } else {
                merged.push({ ...seg });
            }
        }

        // 累计面积：area(t) = ∑ sv_i * duration_i（ms * sv）
        const cumAreas: number[] = [];
        let cum = 0;
        for (const seg of merged) {
            cumAreas.push(cum);
            if (seg.end !== Infinity) {
                const duration = seg.end - seg.start;
                const increment = seg.sv * duration;

                // ✅ 添加溢出检查
                if (!isFinite(increment) || isNaN(increment)) {
                    console.warn(`Invalid increment at ${seg.start}: sv=${seg.sv}, duration=${duration}`);
                    continue;
                }

                cum += increment;

                // ✅ 添加累计值检查
                if (!isFinite(cum) || isNaN(cum)) {
                    console.error(`Cumulative area overflow at ${seg.start}`);
                    cum = cumAreas[cumAreas.length - 1] || 0;  // 回退到上一个值
                }
            } else {
                // Infinity段不计入初始cum，运行时按实际t计算
                cumAreas.push(cum);
                break;
            }
        }

        beatmap.svSegments = merged;
        beatmap.svCumAreas = cumAreas;

        // 5. 添加调试输出（可选，帮助排查）
        console.log('SV Segments:', beatmap.svSegments.map(s =>
            `[${s.start.toFixed(0)}-${s.end === Infinity ? '∞' : s.end.toFixed(0)}]: ${s.sv.toFixed(3)}x`
        ));

        // 构建BPM+SV混合分段
        this.buildCombinedSegments(beatmap);
    }

    // 构建BPM+SV混合分段（BPM影响时间缩放，SV影响滚动速度）
    private buildCombinedSegments(beatmap: Beatmap): void {
        // 使用原始TP（保留负绿点）
        const tp = [...(beatmap.rawTimingPointsForSV || beatmap.timingPoints)].sort((a, b) => a.time - b.time);
        const baseSV = (beatmap.difficulty.SliderVelocity as number || 1);

        // 找到第一个红点作为基准BPM
        const firstRed = tp.find(t => t.uninherited);
        if (!firstRed) {
            // 没有红点，无法计算BPM缩放，使用纯SV分段
            beatmap.combinedSegments = beatmap.svSegments;
            beatmap.combinedCumAreas = beatmap.svCumAreas;
            return;
        }
        const baseBPM = 60000 / firstRed.beatLength;

        // 收集所有可能改变BPM或SV的时间点（包括0）
        const changeTimes = [0, ...Array.from(new Set(tp.map(t => t.time)))].sort((a, b) => a - b);

        const segments: SVSegment[] = [];

        // 找到每个时间点生效的BPM和SV
        const getBPMAndSV = (time: number): { bpm: number; sv: number } => {
            let bpm = baseBPM;
            let sv = baseSV;
            for (let i = 0; i < tp.length; i++) {
                const t = tp[i];
                if (t.time > time) break;
                if (t.uninherited) {
                    // 红点：BPM = 60000 / beatLength
                    bpm = 60000 / t.beatLength;
                    // ✅ 添加 BPM 范围限制
                    if (bpm < 1) bpm = 1;
                    if (bpm > 1000) bpm = 1000;  // 限制最大 BPM
                    if (!isFinite(bpm) || isNaN(bpm)) bpm = baseBPM;
                } else {
                    // 绿点：SV = baseSV * (-100 / beatLength)
                    const raw = t.beatLength || 1;
                    sv = baseSV * (-100 / raw);
                }
            }
            return { bpm, sv: this.clampSV(sv) };  // ✅ 使用统一的范围限制
        }

        for (let i = 0; i < changeTimes.length; i++) {
            const start = changeTimes[i];
            const end = (i < changeTimes.length - 1) ? changeTimes[i + 1] : Infinity;
            const { bpm, sv } = getBPMAndSV(start);
            // 混合乘数 = SV * (当前BPM / 基准BPM)
            const combinedMultiplier = sv;
            segments.push({ start, end, sv: combinedMultiplier });
        }

        // 合并相邻相同乘数段
        const merged: SVSegment[] = [];
        for (const seg of segments) {
            const last = merged[merged.length - 1];
            if (last && last.sv === seg.sv && last.end === seg.start) {
                last.end = seg.end;
            } else {
                merged.push({ ...seg });
            }
        }

        // 累计面积：area(t) = ∑ combinedMultiplier_i * duration_i（ms * multiplier）
        const cumAreas: number[] = [];
        let cum = 0;
        for (const seg of merged) {
            cumAreas.push(cum);
            if (seg.end !== Infinity) {
                const duration = seg.end - seg.start;
                const increment = seg.sv * duration;

                // ✅ 添加溢出检查
                if (!isFinite(increment) || isNaN(increment)) {
                    console.warn(`Invalid increment at ${seg.start}: sv=${seg.sv}, duration=${duration}`);
                    continue;
                }

                cum += increment;

                // ✅ 添加累计值检查
                if (!isFinite(cum) || isNaN(cum)) {
                    console.error(`Cumulative area overflow at ${seg.start}`);
                    cum = cumAreas[cumAreas.length - 1] || 0;  // 回退到上一个值
                }
            } else {
                // Infinity段不计入初始cum，运行时按实际t计算
                cumAreas.push(cum);
                break;
            }
        }

        beatmap.combinedSegments = merged;
        beatmap.combinedCumAreas = cumAreas;
    }

    // 对齐 timingPoints 时间（供小节线等用途，不影响SV）
    private alignTimingPoints(timingPoints: TimingPoint[]): void {
        // 按时间排序
        timingPoints.sort((a, b) => a.time - b.time);

        // 去重（同一时刻只保留一个）
        const uniqueTimingPoints: TimingPoint[] = [];
        const seenTimes = new Set<number>();

        for (const tp of timingPoints) {
            if (!seenTimes.has(tp.time)) {
                uniqueTimingPoints.push(tp);
                seenTimes.add(tp.time);
            }
        }

        // 处理 inherited 和 uninherited 的 timingPoints
        const processedTimingPoints: TimingPoint[] = [];
        let currentBpm = 0;

        for (const tp of uniqueTimingPoints) {
            if (tp.uninherited) {
                currentBpm = 60000 / tp.beatLength;
                processedTimingPoints.push(tp);
            } else {
                // 这里仅为了可视用途给出一个正向数值，不会用于SV
                const adjustedBpm = currentBpm * (-tp.beatLength / 100);
                const adjustedBeatLength = 60000 / adjustedBpm;
                processedTimingPoints.push({
                    ...tp,
                    beatLength: adjustedBeatLength
                });
            }
        }

        // 更新 timingPoints
        timingPoints.splice(0, timingPoints.length, ...processedTimingPoints);
    }

    getBeatmap(): Beatmap | null {
        return this.beatmap;
    }

    // 计算小节时间点（仅按红点，从 tp.time 对齐，分段到下一个红点或曲末）
    private calculateMeasures(beatmap: Beatmap): void {
        const allTP = beatmap.timingPoints || [];
        if (!allTP.length) {
            beatmap.measures = [];
            return;
        }

        // 只取红点（uninherited === true）
        const reds = allTP.filter(tp => tp.uninherited).sort((a, b) => a.time - b.time);
        if (!reds.length) {
            beatmap.measures = [];
            return;
        }

        // 谱面最后时间（含LN尾）
        const lastObjTime = (beatmap.hitObjects || []).reduce((m, o) =>
            Math.max(m, o.isLongNote ? o.endTime : o.time), 0);

        const measures: number[] = [];

        for (let i = 0; i < reds.length; i++) {
            const tp = reds[i];
            const segStart = tp.time; // 以红点对齐
            const nextRedTime = (i + 1 < reds.length) ? reds[i + 1].time : Number.POSITIVE_INFINITY;
            const segEnd = Math.min(nextRedTime, Math.max(lastObjTime, segStart)); // 不跨到下一红点

            const measureLen = tp.beatLength * tp.meter; // 一小节长度(ms)
            if (measureLen <= 0) continue;

            // 从 segStart 开始推小节线，直到 segEnd（略可超一点）
            let t = segStart;
            while (t <= segEnd + 1e-3) {
                measures.push(t);
                t += measureLen;
            }
        }

        // 去重排序（防止边界重复）
        beatmap.measures = Array.from(new Set(measures.map(v => Math.round(v)))).sort((a, b) => a - b);
    }
}
