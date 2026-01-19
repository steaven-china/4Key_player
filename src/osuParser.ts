// OSU格式解析器 - TypeScript版本

import type { Beatmap, TimingPoint, HitObject } from "./beatmapParser.js";
import { BaseBeatmapParser } from "./beatmapParser.js";

export class OSUBeatmapParser extends BaseBeatmapParser {
  parse(content: string): Beatmap {
    const lines = content.split("\n");
    const beatmap: Beatmap = {
      metadata: {},
      general: {},
      difficulty: {},
      timingPoints: [],
      hitObjects: [],
      keyCount: 0,
      svSegments: [],
      svCumAreas: [],
      combinedSegments: [],
      combinedCumAreas: [],
    };

    let currentSection = "";

    for (let line of lines) {
      line = line.trim();
      if (line.startsWith("[") && line.endsWith("]")) {
        currentSection = line.slice(1, -1);
        continue;
      }
      if (line === "" || line.startsWith("//")) continue;

      switch (currentSection) {
        case "General":
          this.parseKeyValue(line, beatmap.general);
          break;
        case "Metadata":
          this.parseKeyValue(line, beatmap.metadata);
          break;
        case "Difficulty":
          this.parseDifficulty(line, beatmap.difficulty);
          break;
        case "TimingPoints":
          this.parseTimingPoint(line, beatmap.timingPoints);
          break;
        case "HitObjects":
          this.parseHitObject(line, beatmap.hitObjects);
          break;
      }
    }

    // 在对齐前保存一份原始TP（保留负SV用）
    const rawTP = beatmap.timingPoints.map((tp) => ({ ...tp }));

    // 对齐 timingPoints 时间（不再用于SV，仅用于小节线和可能的显示）
    this.alignTimingPoints(beatmap.timingPoints);

    // 保存原始TP供SV积分用
    beatmap.rawTimingPointsForSV = rawTP;

    // 解析小节时间点（只按红点分段）
    this.calculateMeasures(beatmap);

    // 键数与列号
    beatmap.keyCount = this.calculateKeyCount(beatmap.hitObjects);
    if (beatmap.keyCount !== 4) {
      beatmap.hitObjects = this.convertTo4Key(
        beatmap.hitObjects,
        beatmap.keyCount,
      );
      beatmap.keyCount = 4;
    } else {
      for (const obj of beatmap.hitObjects) {
        obj.column = Math.floor((obj.x * 4) / 512);
      }
    }

    // 键组（按1/8小节分组，每1/8个小节换一个颜色组）
    if (beatmap.measures && beatmap.measures.length > 0) {
      this.calculateKeyGroupsBySubMeasures(
        beatmap.hitObjects,
        beatmap.measures,
        16, // 每小节分成16个子小节
      );
    } else {
      this.calculateKeyGroups(beatmap.hitObjects);
    }

    // 构建SV分段与累计积分（用于正确下落位置计算）
    this.buildSVSegments(beatmap);
    this.buildCombinedSegments(beatmap);

    this.beatmap = beatmap;
    return beatmap;
  }

  private parseKeyValue(line: string, target: Record<string, string>): void {
    const [key, ...rest] = line.split(":");
    if (!key) return;
    const value = rest.join(":").trim();
    if (value !== "") target[key.trim()] = value.trim();
  }

  private parseDifficulty(
    line: string,
    difficulty: Record<string, number | string>,
  ): void {
    const [key, ...rest] = line.split(":");
    if (!key) return;
    const raw = rest.join(":").trim();
    const num = parseFloat(raw);
    difficulty[key.trim()] = isNaN(num) ? raw : num;
  }

  private parseTimingPoint(line: string, timingPoints: TimingPoint[]): void {
    const parts = line.split(",");
    if (parts.length >= 2) {
      const time = parseFloat(parts[0]);
      const beatLength = parseFloat(parts[1]); // 正=红点(BPM), 负=绿点(SV)
      const meter = parseInt(parts[2]) || 4;
      const uninherited = parts.length < 7 ? true : parts[6] === "1";
      timingPoints.push({
        time,
        beatLength,
        meter,
        uninherited,
      });
    }
  }

  private parseHitObject(line: string, hitObjects: HitObject[]): void {
    const parts = line.split(",");
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
        keyGroup: 0,
      };
      if (isLongNote && parts.length >= 6) {
        const endTimeStr = parts[5].split(":")[0];
        obj.endTime = parseInt(endTimeStr, 10);
      }
      hitObjects.push(obj);
    }
  }
}
