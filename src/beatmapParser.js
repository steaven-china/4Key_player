// Beatmap解析器（修复SV与积分）
export class BeatmapParser {
    constructor() {
        this.beatmap = null;
    }

    parse(content) {
        const lines = content.split('\n');
        const beatmap = {
            metadata: {},
            general: {},
            difficulty: {},
            timingPoints: [],
            hitObjects: [],
            keyCount: 0,
            svSegments: [],       // SV分段
            svCumAreas: []        // 每段起点的累计面积（ms * sv）
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
                    this.parseTimingPoint(line, beatmap.timingPoints);
                    break;
                case 'HitObjects':
                    this.parseHitObject(line, beatmap.hitObjects);
                    break;
            }
        }

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

    parseKeyValue(line, target) {
        const [key, ...rest] = line.split(':');
        if (!key) return;
        const value = rest.join(':').trim();
        if (value !== '') target[key.trim()] = value.trim();
    }

    parseDifficulty(line, difficulty) {
        const [key, ...rest] = line.split(':');
        if (!key) return;
        const raw = rest.join(':').trim();
        const num = parseFloat(raw);
        difficulty[key.trim()] = isNaN(num) ? raw : num;
    }

    parseTimingPoint(line, timingPoints) {
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

    parseHitObject(line, hitObjects) {
        const parts = line.split(',');
        if (parts.length >= 4) {
            const x = parseInt(parts[0], 10);
            const time = parseInt(parts[2], 10);
            const type = parseInt(parts[3], 10);
            const isLongNote = !!(type & 128);
            const obj = {
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

    calculateKeyCount(hitObjects) {
        const xs = [...new Set(hitObjects.map(o => o.x))];
        return xs.length || 4;
    }

    convertTo4Key(hitObjects, originalKeyCount) {
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

    calculateKeyGroups(hitObjects) {
        hitObjects.sort((a, b) => a.time - b.time);
        let currentGroup = 0, lastTime = -1;
        const timeThreshold = 5; // 5ms内算同组
        for (const obj of hitObjects) {
            if (obj.time - lastTime > timeThreshold) currentGroup++;
            obj.keyGroup = currentGroup;
            lastTime = obj.time;
        }
    }

    // 构建SV分段并预计算累计面积（ms * sv）
    buildSVSegments(beatmap) {
        const tp = [...beatmap.timingPoints].sort((a, b) => a.time - b.time);
        const baseSV = (beatmap.difficulty.SliderVelocity || 1); // 默认1

        // 收集所有可能改变SV的时间点（包括0）
        const changeTimes = [0, ...new Set(tp.map(t => t.time))].sort((a, b) => a - b);

        const segments = [];
        let currentSV = baseSV;
        // 找到每个时间点生效的SV（最近的有效绿点，否则baseSV）
        function svAt(time) {
            let sv = baseSV;
            for (let i = 0; i < tp.length; i++) {
                const t = tp[i];
                if (t.time > time) break;
                if (!t.uninherited && t.beatLength < 0) {
                    // 绿点，SV = baseSV * (100 / -beatLength)
                    sv = baseSV * (100 / Math.abs(t.beatLength));
                }
            }
            return sv;
        }

        for (let i = 0; i < changeTimes.length; i++) {
            const start = changeTimes[i];
            const end = (i < changeTimes.length - 1) ? changeTimes[i + 1] : Infinity;
            currentSV = svAt(start);
            segments.push({ start, end, sv: currentSV });
        }

        // 合并相邻相同SV段
        const merged = [];
        for (const seg of segments) {
            const last = merged[merged.length - 1];
            if (last && last.sv === seg.sv && last.end === seg.start) {
                last.end = seg.end;
            } else {
                merged.push({ ...seg });
            }
        }

        // 累计面积：area(t) = ∑ sv_i * duration_i（ms * sv）
        const cumAreas = [];
        let cum = 0;
        for (const seg of merged) {
            cumAreas.push(cum); // 段起点的累计面积
            if (seg.end !== Infinity) {
                cum += seg.sv * (seg.end - seg.start);
            } else {
                // Infinity段不计入初始cum，运行时按实际t计算
                cumAreas.push(cum);
                break;
            }
        }

        beatmap.svSegments = merged;
        beatmap.svCumAreas = cumAreas;
    }

    getBeatmap() {
        return this.beatmap;
    }
}
