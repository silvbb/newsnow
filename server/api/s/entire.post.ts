import type { SourceID, SourceResponse } from "@shared/types"
import { getCacheTable } from "#/database/cache"

export default defineEventHandler(async (event) => {
  try {
    const { sources: _ }: { sources: SourceID[] } = await readBody(event)
    const cacheTable = await getCacheTable()
    const ids = _?.filter(k => sources[k])
    if (ids?.length && cacheTable) {
      const caches = await cacheTable.getEntire(ids)
      const now = Date.now()
      return caches.map(cache => ({
        status: "cache",
        id: cache.id,
        items: cache.items,
        updatedTime:
          now - cache.updated < sources[cache.id].interval
            ? now
            : cache.updated,
      })) as SourceResponse[]
    }
  } catch (e) {
    // 捕获错误对象 e
    logger.error("Error in /api/s/entire:", e) // 使用 logger 打印错误
    // 您可以选择在这里重新抛出错误，或者返回一个错误响应给前端
    // throw createError({ statusCode: 500, message: 'Failed to fetch data' });
  }
})
