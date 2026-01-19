// Beatmap解析器基础接口和抽象类 - TypeScript版本

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

// 解析器接口
export interface IBeatmapParser {
  parse(content: string): Beatmap;
  getBeatmap(): Beatmap | null;
}

// 抽象基类，包含公共逻辑
export abstract class BaseBeatmapParser implements IBeatmapParser {
  protected beatmap: Beatmap | null = null;

  constructor() {
    this.beatmap = null;
  }

  abstract parse(content: string): Beatmap;

  getBeatmap(): Beatmap | null {
    return this.beatmap;
  }

  // 公共工具方法
  protected clampSV(sv: number): number {
    const MIN_SV = 0.1;
    const MAX_SV = 10.0;
    return Math.max(MIN_SV, Math.min(MAX_SV, sv));
  }

  protected calculateKeyCount(hitObjects: HitObject[]): number {
    const xs = hitObjects.map((obj) => Math.floor((obj.x * 8) / 512));
    const uniqueXs = new Set(xs);
    return uniqueXs.size;
  }

  protected convertTo4Key(
    objs: HitObject[],
    originalKeyCount: number,
  ): HitObject[] {
    const originalColumn = (x: number) =>
      Math.floor((x * originalKeyCount) / 512);
    const newColumn = (originalCol: number) =>
      Math.floor((originalCol * 4) / originalKeyCount);
    return objs.map((obj) => ({
      ...obj,
      x: Math.floor((obj.x * 4) / originalKeyCount),
      column: newColumn(originalColumn(obj.x)),
    }));
  }

  protected calculateKeyGroups(hitObjects: HitObject[]): void {
    let currentGroup = 0;
    let lastTime = -Infinity;
    const timeThreshold = 150; // ms

    for (const obj of hitObjects) {
      if (obj.time - lastTime > timeThreshold) {
        currentGroup++;
      }
      obj.keyGroup = currentGroup;
      lastTime = obj.time;
    }
  }

  protected calculateKeyGroupsByMeasure(
    hitObjects: HitObject[],
    measures: number[],
  ): void {
    let currentGroup = 0;
    let measureIndex = 0;

    for (const obj of hitObjects) {
      // 找到当前音符所在的小节
      while (
        measureIndex < measures.length - 1 &&
        obj.time >= measures[measureIndex + 1]
      ) {
        measureIndex++;
        currentGroup++;
      }
      obj.keyGroup = currentGroup;
    }
  }

  protected calculateKeyGroupsByMeasureGroups(
    hitObjects: HitObject[],
    measures: number[],
    measuresPerGroup: number = 8,
  ): void {
    let currentGroup = 0;
    let measureIndex = 0;
    let measuresInCurrentGroup = 0;

    for (const obj of hitObjects) {
      // 找到当前音符所在的小节
      while (
        measureIndex < measures.length - 1 &&
        obj.time >= measures[measureIndex + 1]
      ) {
        measureIndex++;
        measuresInCurrentGroup++;

        // 每 measuresPerGroup 个小节换一个颜色组
        if (measuresInCurrentGroup >= measuresPerGroup) {
          currentGroup++;
          measuresInCurrentGroup = 0;
        }
      }
      obj.keyGroup = currentGroup;
    }
  }

  protected calculateKeyGroupsBySubMeasures(
    hitObjects: HitObject[],
    measures: number[],
    subdivisions: number = 16,
  ): void {
    if (measures.length < 2) {
      // 如果没有足够的小节信息，回退到时间间隔分组
      this.calculateKeyGroups(hitObjects);
      return;
    }

    let measureIndex = 0;
    const groupsPerMeasure = 8; // 每小节分成8个颜色组

    for (const obj of hitObjects) {
      // 找到当前音符所在的小节区间
      while (
        measureIndex < measures.length - 1 &&
        obj.time >= measures[measureIndex + 1]
      ) {
        measureIndex++;
      }

      // 计算在当前小节内的位置
      const measureStart = measures[measureIndex];
      const measureEnd =
        measureIndex + 1 < measures.length
          ? measures[measureIndex + 1]
          : measureStart + (60000 / 120) * 4; // 默认4/4拍，120BPM

      const measureDuration = measureEnd - measureStart;
      const positionInMeasure = obj.time - measureStart;

      // 计算属于第几个1/subdivisions小节（每小节分成subdivisions份）
      const subMeasureIndex = Math.floor(
        (positionInMeasure / measureDuration) * subdivisions,
      );

      // 计算全局的组索引：measureIndex * subdivisions + subMeasureIndex
      const globalGroupIndex = measureIndex * subdivisions + subMeasureIndex;

      // 每 (subdivisions / groupsPerMeasure) 个子小节换一个颜色组
      // 例如：subdivisions=16, groupsPerMeasure=8 => 每2个子小节换一个颜色组
      const groupSize = subdivisions / groupsPerMeasure;
      obj.keyGroup = Math.floor(globalGroupIndex / groupSize);
    }
  }

  protected buildSVSegments(beatmap: Beatmap): void {
    const tp = beatmap.rawTimingPointsForSV || beatmap.timingPoints;
    const baseSV = 1.0;

    // 收集所有变化时间点
    const changeTimes = new Set<number>();
    changeTimes.add(0);
    for (const point of tp) {
      changeTimes.add(point.time);
    }

    // 对每个时间点计算SV
    const svAt = (t: number): number => {
      let sv = baseSV;
      for (let i = tp.length - 1; i >= 0; i--) {
        const raw = tp[i];
        if (raw.time <= t) {
          if (!raw.uninherited) {
            sv = this.clampSV(-100 / raw.beatLength);
          }
          break;
        }
      }
      return sv;
    };

    const times = Array.from(changeTimes).sort((a, b) => a - b);
    const segments: SVSegment[] = [];
    const cumAreas: number[] = [];

    for (let i = 0; i < times.length; i++) {
      const start = times[i];
      const end = i + 1 < times.length ? times[i + 1] : Infinity;
      const currentSV = svAt(start);

      segments.push({ start, end, sv: currentSV });
    }

    // 合并相邻相同SV的段
    const merged: SVSegment[] = [];
    for (const seg of segments) {
      if (merged.length === 0) {
        merged.push({ ...seg });
      } else {
        const last = merged[merged.length - 1];
        if (Math.abs(last.sv - seg.sv) < 1e-6 && last.end === seg.start) {
          last.end = seg.end;
        } else {
          merged.push({ ...seg });
        }
      }
    }

    // 计算累计面积
    let cum = 0;
    for (const seg of merged) {
      cumAreas.push(cum);
      const duration = seg.end === Infinity ? 0 : seg.end - seg.start;
      const increment = seg.sv * duration;
      cum += increment;
    }

    beatmap.svSegments = merged;
    beatmap.svCumAreas = cumAreas;
  }

  protected buildCombinedSegments(beatmap: Beatmap): void {
    const tp = beatmap.rawTimingPointsForSV || beatmap.timingPoints;
    const baseSV = 1.0;

    // 找到第一个红点
    const firstRed = tp.find((p) => p.uninherited);
    const baseBPM = firstRed ? 60000 / firstRed.beatLength : 120;

    // 收集所有变化时间点
    const changeTimes = new Set<number>();
    changeTimes.add(0);
    for (const point of tp) {
      changeTimes.add(point.time);
    }

    // 对每个时间点计算BPM和SV
    const getBPMAndSV = (t: number): { bpm: number; sv: number } => {
      let bpm = baseBPM;
      let sv = baseSV;
      for (let i = tp.length - 1; i >= 0; i--) {
        const raw = tp[i];
        if (raw.time <= t) {
          if (raw.uninherited) {
            bpm = 60000 / raw.beatLength;
          } else {
            sv = this.clampSV(-100 / raw.beatLength);
          }
          break;
        }
      }
      return { bpm, sv };
    };

    const times = Array.from(changeTimes).sort((a, b) => a - b);
    const segments: SVSegment[] = [];
    const cumAreas: number[] = [];

    for (let i = 0; i < times.length; i++) {
      const start = times[i];
      const end = i + 1 < times.length ? times[i + 1] : Infinity;
      const { bpm, sv } = getBPMAndSV(start);
      const combinedMultiplier = sv * (bpm / baseBPM);

      segments.push({ start, end, sv: combinedMultiplier });
    }

    // 合并相邻相同乘数的段
    const merged: SVSegment[] = [];
    for (const seg of segments) {
      if (merged.length === 0) {
        merged.push({ ...seg });
      } else {
        const last = merged[merged.length - 1];
        if (Math.abs(last.sv - seg.sv) < 1e-6 && last.end === seg.start) {
          last.end = seg.end;
        } else {
          merged.push({ ...seg });
        }
      }
    }

    // 计算累计面积
    let cum = 0;
    for (const seg of merged) {
      cumAreas.push(cum);
      const duration = seg.end === Infinity ? 0 : seg.end - seg.start;
      const increment = seg.sv * duration;
      cum += increment;
    }

    beatmap.combinedSegments = merged;
    beatmap.combinedCumAreas = cumAreas;
  }

  protected alignTimingPoints(timingPoints: TimingPoint[]): void {
    const uniqueTimingPoints: TimingPoint[] = [];
    const seenTimes = new Set<number>();

    for (const tp of timingPoints) {
      if (!seenTimes.has(tp.time)) {
        seenTimes.add(tp.time);
        uniqueTimingPoints.push(tp);
      }
    }

    uniqueTimingPoints.sort((a, b) => a.time - b.time);

    const processedTimingPoints: TimingPoint[] = [];
    let currentBpm = 120;

    for (const tp of uniqueTimingPoints) {
      if (tp.uninherited) {
        currentBpm = 60000 / tp.beatLength;
        processedTimingPoints.push(tp);
      } else {
        const adjustedBpm = currentBpm;
        const adjustedBeatLength = 60000 / adjustedBpm;
        processedTimingPoints.push({
          ...tp,
          beatLength: adjustedBeatLength,
        });
      }
    }

    timingPoints.length = 0;
    timingPoints.push(...processedTimingPoints);
  }

  protected calculateMeasures(beatmap: Beatmap): void {
    const allTP = beatmap.timingPoints;
    const reds = allTP.filter((tp) => tp.uninherited);
    if (reds.length === 0) return;

    const lastObjTime = beatmap.hitObjects.reduce((max, obj) => {
      const objEnd = obj.isLongNote ? obj.endTime : obj.time;
      return Math.max(max, objEnd);
    }, 0);

    const measures: number[] = [];
    for (let i = 0; i < reds.length; i++) {
      const tp = reds[i];
      const segStart = tp.time;
      const nextRedTime =
        i + 1 < reds.length ? reds[i + 1].time : lastObjTime + 10000;
      const segEnd = nextRedTime;
      const measureLen = (60000 / Math.abs(tp.beatLength)) * tp.meter;

      let t = segStart;
      while (t < segEnd) {
        measures.push(t);
        t += measureLen;
      }
    }

    beatmap.measures = measures;
  }
}
