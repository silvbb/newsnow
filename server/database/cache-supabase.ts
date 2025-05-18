import type { NewsItem } from "@shared/types"
import type { CacheInfo } from "../types"
import { supabase } from "./supabase"
import { logger } from "#/utils/logger" // 确保导入 logger

export class Cache {
  /**
   * 初始化缓存表
   */
  async init() {
    const { error } = await supabase.from("cache").select("id").limit(1)
    if (error?.message.includes("relation \"cache\" does not exist")) {
      await supabase.query(`
        CREATE TABLE IF NOT EXISTS cache (
          id TEXT PRIMARY KEY,
          updated BIGINT,
          data TEXT
        );
      `)
    }
  }

  /**
   * 设置缓存数据
   */
  async set(key: string, value: NewsItem[]) {
    const now = Date.now()
    const { error } = await supabase.from("cache").upsert({
      id: key,
      data: JSON.stringify(value),
      updated: now,
    })
    if (error) throw error
    logger.success(`set ${key} cache`)
  }

  /**
   * 获取缓存数据
   */
  async get(key: string): Promise<CacheInfo | undefined> {
    const { data, error } = await supabase
      .from("cache")
      .select("id, data, updated")
      .eq("id", key)
      .single()

    if (error) return undefined
    if (data) {
      logger.success(`get ${key} cache`)
      return {
        id: data.id,
        updated: data.updated,
        items: JSON.parse(data.data),
      }
    }
  }

  /**
   * 批量获取缓存数据
   */
  async getEntire(keys: string[]): Promise<CacheInfo[]> {
    const { data, error } = await supabase
      .from("cache")
      .select("id, data, updated")
      .in("id", keys)

    if (error) return []
    if (data?.length) {
      logger.success(`get entire (...) cache`)
      return data.map(row => ({
        id: row.id,
        updated: row.updated,
        items: JSON.parse(row.data) as NewsItem[],
      }))
    }
    return []
  }

  /**
   * 删除缓存数据
   */
  async delete(key: string) {
    const { error } = await supabase.from("cache").delete().eq("id", key)

    if (error) throw error
  }
}

/**
 * 获取缓存表实例
 * @returns {Promise<Cache | undefined>} 缓存表实例或 undefined
 */
export async function getCacheTable() {
  try {
    // 在使用 process.env 的行禁用 node/prefer-global/process 规则
    if (process.env.ENABLE_CACHE === "false") return // eslint-disable-line node/prefer-global/process
    const cacheTable = new Cache()
    // 在使用 process.env 的行禁用 node/prefer-global/process 规则
    if (process.env.INIT_TABLE !== "false") await cacheTable.init() // eslint-disable-line node/prefer-global/process
    return cacheTable
  } catch (e) {
    logger.error("failed to init database ", e)
    return undefined
  }
}
