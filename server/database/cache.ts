import process from "node:process"
import type { NewsItem } from "@shared/types"
import type { Database } from "db0"
import type { CacheInfo, CacheRow } from "../types"
import { logger } from "#/utils/logger" // 确保导入 logger

export class Cache {
  private db
  constructor(db: Database) {
    this.db = db
  }

  /**
   * 初始化缓存表
   */
  async init() {
    await this.db
      .prepare(
        `
      CREATE TABLE IF NOT EXISTS cache (
        id TEXT PRIMARY KEY,
        updated INTEGER,
        data TEXT
      );
    `,
      )
      .run()
    logger.success(`init cache table`)
  }

  /**
   * 设置缓存数据，如果存在则更新
   * @param key - 缓存项 ID
   * @param value - 要缓存的数据
   */
  async set(key: string, value: NewsItem[]) {
    const now = Date.now()
    // 修改为 PostgreSQL 的 ON CONFLICT 语法
    await this.db
      .prepare(
        `INSERT INTO cache (id, data, updated)
       VALUES (?, ?, ?)
       ON CONFLICT (id)
       DO UPDATE SET
         data = EXCLUDED.data,
         updated = EXCLUDED.updated;`,
      )
      .run(key, JSON.stringify(value), now)
    logger.success(`set ${key} cache`)
  }

  /**
   * 获取单个缓存项
   * @param key - 缓存项 ID
   * @returns {Promise<CacheInfo | undefined>} 缓存数据或 undefined
   */
  async get(key: string): Promise<CacheInfo | undefined> {
    const row = (await this.db
      .prepare(`SELECT id, data, updated FROM cache WHERE id = ?`)
      .get(key)) as CacheRow | undefined
    if (row) {
      logger.success(`get ${key} cache`)
      return {
        id: row.id,
        updated: row.updated,
        items: JSON.parse(row.data),
      }
    }
  }

  /**
   * 批量获取缓存项
   * @param keys - 缓存项 ID 数组
   * @returns {Promise<CacheInfo[]>} 缓存数据数组
   */
  async getEntire(keys: string[]): Promise<CacheInfo[]> {
    const keysStr = keys.map(k => `id = '${k}'`).join(" or ")
    // 这里的 SQL 语法对于 PostgreSQL 是正确的
    const res = (await this.db
      .prepare(`SELECT id, data, updated FROM cache WHERE ${keysStr}`)
      .all()) as any
    const rows = (res.results ?? res) as CacheRow[]

    /**
     * https://developers.cloudflare.com/d1/build-with-d1/d1-client-api/#return-object
     * cloudflare d1 .all() will return
     * {
     *   success: boolean
     *   meta:
     *   results:
     * }
     */
    if (rows?.length) {
      logger.success(`get entire (...) cache`)
      return rows.map(row => ({
        id: row.id,
        updated: row.updated,
        items: JSON.parse(row.data) as NewsItem[],
      }))
    } else {
      return []
    }
  }

  /**
   * 删除缓存项
   * @param key - 要删除的缓存项 ID
   * @returns {Promise<any>} 删除结果
   */
  async delete(key: string) {
    return await this.db.prepare(`DELETE FROM cache WHERE id = ?`).run(key)
  }
}

/**
 * 获取缓存表实例
 * @returns {Promise<Cache | undefined>} 缓存表实例或 undefined
 */
export async function getCacheTable() {
  try {
    const db = useDatabase()
    // logger.info("db: ", db.getInstance())
    if (process.env.ENABLE_CACHE === "false") return
    const cacheTable = new Cache(db)
    // 只有在 INIT_TABLE 不为 false 时才初始化表
    if (process.env.INIT_TABLE !== "false") {
      // 检查数据库连接器是否为 postgresql，如果是则跳过 init
      // 因为 Supabase 的表通常是手动创建的，或者通过 Supabase 客户端库处理
      // 并且 db0 的 init 方法可能执行不兼容的 SQL
      // 如果您确定 db0 的 init 方法在 postgresql 连接器下是安全的，可以移除此检查
      const dbInstance = db.getInstance()
      if (dbInstance && dbInstance.constructor.name !== "Client") {
        // 简单的检查是否为 pg 客户端实例
        await cacheTable.init()
      } else {
        logger.info("Skipping cache table init for PostgreSQL connector.")
      }
    }
    return cacheTable
  } catch (e) {
    logger.error("failed to get database or init cache table ", e) // 修改日志信息
    // 可以在这里选择重新抛出错误，或者返回 undefined
    // throw e;
    return undefined // 返回 undefined 表示获取缓存表失败
  }
}
