// 解析器工厂 - TypeScript版本

import type { IBeatmapParser, Beatmap } from "./beatmapParser.js";
import { OSUBeatmapParser } from "./osuParser.js";
import { JSONBeatmapParser } from "./jsonParser.js";

/**
 * 解析器工厂类
 * 根据内容自动选择合适的解析器
 */
export class BeatmapParserFactory {
  /**
   * 根据内容自动选择解析器
   * @param content 谱面内容
   * @returns 合适的解析器实例
   */
  static createParser(content: string): IBeatmapParser {
    const trimmedContent = content.trim();

    // 检查是否是JSON格式
    if (this.isJSONFormat(trimmedContent)) {
      return new JSONBeatmapParser();
    }

    // 检查是否是OSU格式
    if (this.isOSUFormat(trimmedContent)) {
      return new OSUBeatmapParser();
    }

    // 默认使用OSU解析器（向后兼容）
    console.warn("无法确定谱面格式，默认使用OSU解析器");
    return new OSUBeatmapParser();
  }

  /**
   * 检查内容是否是JSON格式
   * @param content 谱面内容
   * @returns 是否是JSON格式
   */
  static isJSONFormat(content: string): boolean {
    try {
      // 快速检查：是否以 { 开头
      if (!content.startsWith("{")) {
        return false;
      }

      // 尝试解析JSON
      const parsed = JSON.parse(content);

      // 验证必需字段
      if (!parsed || typeof parsed !== "object") {
        return false;
      }

      // 检查是否有JSON谱面的特征字段
      const hasFormatVersion = "formatVersion" in parsed;
      const hasObjectsField =
        "objects" in parsed &&
        parsed.objects &&
        typeof parsed.objects === "object" &&
        "hitObjects" in parsed.objects;

      return hasFormatVersion || hasObjectsField;
    } catch (error) {
      return false;
    }
  }

  /**
   * 检查内容是否是OSU格式
   * @param content 谱面内容
   * @returns 是否是OSU格式
   */
  static isOSUFormat(content: string): boolean {
    // OSU格式的特征：
    // 1. 包含 [General]、[Metadata] 等节标记
    // 2. 包含 osu file format v 版本声明
    // 3. 使用键值对格式

    const lines = content.split("\n").slice(0, 10); // 检查前10行

    // 检查版本声明
    const hasVersionLine = lines.some((line) =>
      line.toLowerCase().includes("osu file format v"),
    );

    // 检查节标记
    const hasSectionMarkers = lines.some(
      (line) => line.trim().startsWith("[") && line.trim().endsWith("]"),
    );

    // 检查键值对格式
    const hasKeyValuePairs = lines.some((line) => {
      const trimmed = line.trim();
      return (
        trimmed.includes(":") && !trimmed.startsWith("//") && trimmed !== ""
      );
    });

    return hasVersionLine || (hasSectionMarkers && hasKeyValuePairs);
  }

  /**
   * 根据文件扩展名创建解析器
   * @param filename 文件名
   * @returns 合适的解析器实例
   */
  static createParserByExtension(filename: string): IBeatmapParser {
    const extension = filename.toLowerCase().split(".").pop();

    switch (extension) {
      case "json":
      case "4key":
      case "4keyjson":
        return new JSONBeatmapParser();

      case "osu":
        return new OSUBeatmapParser();

      case "osz":
        // .osz 文件需要先解压，然后使用OSU解析器
        console.warn(
          ".osz files need to be extracted first, using OSU parser for internal .osu files",
        );
        return new OSUBeatmapParser();

      default:
        console.warn(
          `Unknown file extension: .${extension}, defaulting to OSU parser`,
        );
        return new OSUBeatmapParser();
    }
  }

  /**
   * 解析谱面内容（自动选择解析器）
   * @param content 谱面内容
   * @returns 解析后的谱面
   */
  static parse(content: string): Beatmap {
    const parser = this.createParser(content);
    return parser.parse(content);
  }

  /**
   * 批量解析谱面
   * @param contents 谱面内容数组
   * @returns 解析后的谱面数组
   */
  static parseAll(contents: string[]): Beatmap[] {
    return contents.map((content) => this.parse(content));
  }
}

/**
 * 工具函数：检测内容类型
 */
export function detectContentType(content: string): "json" | "osu" | "unknown" {
  const trimmed = content.trim();

  if (BeatmapParserFactory.isJSONFormat(trimmed)) {
    return "json";
  }

  if (BeatmapParserFactory.isOSUFormat(trimmed)) {
    return "osu";
  }

  return "unknown";
}

/**
 * 工具函数：获取推荐的文件扩展名
 */
export function getRecommendedExtension(content: string): string {
  const type = detectContentType(content);

  switch (type) {
    case "json":
      return ".4key.json";
    case "osu":
      return ".osu";
    default:
      return ".txt";
  }
}

// 导出默认工厂实例
export default BeatmapParserFactory;
