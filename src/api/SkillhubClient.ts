/**
 * SkillhubClient — 纯 HTTP 请求层
 *
 * 直接调注册中心 API，支持国内源 (SkillHub) 和国际源 (ClawHub)。
 */

import * as https from "https";
import * as http from "http";
import type { Endpoints } from "../config/ConfigResolver";

const USER_AGENT = "ai-skill-manager/1.0.0";
const DEFAULT_TIMEOUT = 15_000;

export interface SkillSearchResult {
  slug: string;
  name: string;
  description: string;
  summary: string;
  version: string;
}

export interface SkillDetail {
  slug: string;
  displayName: string;
  summary: string;
  summaryZh: string;
  category: string;
  version: string;
  owner: string;
  downloads: number;
  installs: number;
  stars: number;
  comments: number;
  updatedAt: number;
}

export interface SkillCategory {
  key: string;
  name: string;
  nameEn: string;
}

// ── 通用 HTTP 工具 ──────────────────────────────────────────

function httpGet(
  targetUrl: string,
  timeout = DEFAULT_TIMEOUT
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const transport = parsed.protocol === "https:" ? https : http;

    const req = transport.get(
      targetUrl,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json, application/octet-stream, */*",
        },
        timeout,
      },
      (res) => {
        // 跟随重定向（最多 5 次）
        if (
          res.statusCode &&
          [301, 302, 307, 308].includes(res.statusCode) &&
          res.headers.location
        ) {
          res.resume();
          httpGet(res.headers.location, timeout).then(resolve, reject);
          return;
        }

        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${targetUrl}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout (${timeout}ms) for ${targetUrl}`));
    });
  });
}

async function httpGetJson<T = unknown>(targetUrl: string): Promise<T> {
  const buf = await httpGet(targetUrl);
  return JSON.parse(buf.toString("utf-8")) as T;
}

// ── 公开 API ────────────────────────────────────────────────

export class SkillhubClient {
  constructor(private endpoints: Endpoints) {}

  /** 更新端点（数据源切换后调用） */
  updateEndpoints(endpoints: Endpoints): void {
    this.endpoints = endpoints;
  }

  /** 搜索技能 */
  async search(
    query: string,
    limit = 20
  ): Promise<SkillSearchResult[]> {
    const base = this.endpoints.skillsSearchUrl;
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const fullUrl = `${base}${base.includes("?") ? "&" : "?"}${params}`;

    const data = await httpGetJson<Record<string, unknown>>(fullUrl);
    const results = Array.isArray(data.results) ? data.results : [];

    return results
      .filter(
        (item: unknown): item is Record<string, unknown> =>
          typeof item === "object" && item !== null
      )
      .map((item) => ({
        slug: String(item.slug ?? "").trim(),
        name: String(item.displayName ?? item.name ?? item.slug ?? "").trim(),
        description: String(item.summary ?? item.description ?? "").trim(),
        summary: String(item.summary ?? "").trim(),
        version: String(item.version ?? "").trim(),
      }))
      .filter((r) => r.slug);
  }

  /** 获取单个技能详情（含 stats） */
  async fetchSkillDetail(slug: string): Promise<SkillDetail | null> {
    const baseUrl = this.endpoints.skillsSearchUrl.replace(/\/search\b.*$/, "");
    const detailUrl = `${baseUrl}/skills/${encodeURIComponent(slug)}`;
    try {
      const data = await httpGetJson<Record<string, unknown>>(detailUrl);
      const skill = (data.skill ?? {}) as Record<string, unknown>;
      const stats = (skill.stats ?? {}) as Record<string, unknown>;
      const owner = (data.owner ?? {}) as Record<string, unknown>;
      const latest = (data.latestVersion ?? {}) as Record<string, unknown>;
      return {
        slug: String(skill.slug ?? slug),
        displayName: String(skill.displayName ?? slug),
        summary: String(skill.summary ?? ""),
        summaryZh: String(skill.summary_zh ?? ""),
        category: String(skill.category ?? ""),
        version: String(latest.version ?? skill.tags?.toString() ?? ""),
        owner: String(owner.displayName ?? owner.handle ?? ""),
        downloads: Number(stats.downloads ?? 0),
        installs: Number(stats.installs ?? 0),
        stars: Number(stats.stars ?? 0),
        comments: Number(stats.comments ?? 0),
        updatedAt: Number(skill.updatedAt ?? 0),
      };
    } catch {
      return null;
    }
  }

  /** 批量获取技能详情（并发，失败静默跳过） */
  async fetchSkillDetails(slugs: string[]): Promise<Map<string, SkillDetail>> {
    const map = new Map<string, SkillDetail>();
    const promises = slugs.map(async (slug) => {
      const detail = await this.fetchSkillDetail(slug);
      if (detail) map.set(slug, detail);
    });
    await Promise.all(promises);
    return map;
  }

  /** 获取分类列表 */
  async fetchCategories(): Promise<SkillCategory[]> {
    const baseUrl = this.endpoints.skillsSearchUrl.replace(/\/search\b.*$/, "");
    const data = await httpGetJson<Record<string, unknown>>(`${baseUrl}/categories`);
    const items = Array.isArray(data.items) ? data.items : [];
    return items
      .filter((item: unknown): item is Record<string, unknown> =>
        typeof item === "object" && item !== null)
      .map((item) => ({
        key: String(item.key ?? ""),
        name: String(item.name ?? ""),
        nameEn: String(item.nameEn ?? ""),
      }))
      .filter((c) => c.key);
  }

  /** 按分类搜索技能 */
  async searchByCategory(
    category: string,
    limit = 20
  ): Promise<SkillSearchResult[]> {
    const base = this.endpoints.skillsSearchUrl;
    const params = new URLSearchParams({ category, limit: String(limit) });
    const fullUrl = `${base}${base.includes("?") ? "&" : "?"}${params}`;
    const data = await httpGetJson<Record<string, unknown>>(fullUrl);
    const results = Array.isArray(data.results) ? data.results : [];
    return results
      .filter((item: unknown): item is Record<string, unknown> =>
        typeof item === "object" && item !== null)
      .map((item) => ({
        slug: String(item.slug ?? "").trim(),
        name: String(item.displayName ?? item.name ?? item.slug ?? "").trim(),
        description: String(item.summary ?? item.description ?? "").trim(),
        summary: String(item.summary ?? "").trim(),
        version: String(item.version ?? "").trim(),
      }))
      .filter((r) => r.slug);
  }

  /** 下载技能包 zip 到 Buffer（主源 + fallback） */
  async downloadSkillZip(slug: string): Promise<Buffer> {
    const primaryUrl = this.endpoints.skillsPrimaryDownloadTemplate.replace(
      "{slug}",
      encodeURIComponent(slug)
    );
    const fallbackUrl = this.endpoints.skillsDownloadTemplate.replace(
      "{slug}",
      encodeURIComponent(slug)
    );

    try {
      return await httpGet(primaryUrl);
    } catch (primaryErr) {
      console.warn(
        `[skillhub] primary download failed for ${slug}, trying fallback:`,
        primaryErr
      );
      return await httpGet(fallbackUrl);
    }
  }
}
