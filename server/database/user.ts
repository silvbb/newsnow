import type { Database } from "db0"
import type { UserInfo } from "#/types"
import { logger } from "#/utils/logger" // 确保导入 logger

export class UserTable {
  private db
  constructor(db: Database) {
    this.db = db
  }

  /**
   * 初始化用户表和索引
   */
  async init() {
    await this.db
      .prepare(
        `
      CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY,
        email TEXT,
        data TEXT,
        type TEXT,
        created INTEGER,
        updated INTEGER
      );
    `,
      )
      .run()
    await this.db
      .prepare(
        `
      CREATE INDEX IF NOT EXISTS idx_user_id ON user(id);
    `,
      )
      .run()
    logger.success(`init user table`)
  }

  /**
   * 添加或更新用户信息
   * 如果用户不存在则插入新用户，如果用户存在则更新 email, data, type 和 updated 字段
   * @param id - 用户 ID
   * @param email - 用户邮箱
   * @param type - 用户类型 (例如 "github")
   */
  async addUser(id: string, email: string, type: "github") {
    const now = Date.now()
    // 使用 PostgreSQL 的 ON CONFLICT 语法实现 upsert
    await this.db
      .prepare(
        `INSERT INTO user (id, email, data, type, created, updated)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id)
       DO UPDATE SET
         email = EXCLUDED.email,
         data = EXCLUDED.data,
         type = EXCLUDED.type,
         updated = EXCLUDED.updated;`,
      )
      .run(id, email, "", type, now, now) // 初始 data 为空字符串
    logger.success(`add or update user ${id}`)
  }

  /**
   * 根据用户 ID 获取用户信息
   * @param id - 用户 ID
   * @returns {Promise<UserInfo | undefined>} 用户信息或 undefined
   */
  async getUser(id: string) {
    // 注意：db0 的 .get() 方法在找不到记录时可能返回 undefined 或 null
    // 这里的类型断言 UserInfo 假设查询结果结构正确
    return (await this.db
      .prepare(
        `SELECT id, email, data, created, updated FROM user WHERE id = ?`,
      )
      .get(id)) as UserInfo | undefined
  }

  /**
   * 设置用户关联的数据字段
   * @param key - 用户 ID
   * @param value - 要设置的数据字符串
   * @param updatedTime - 更新时间戳 (默认为当前时间)
   * @returns {Promise<void>}
   * @throws {Error} 如果设置失败
   */
  async setData(key: string, value: string, updatedTime = Date.now()) {
    const _state = await this.db
      .prepare(`UPDATE user SET data = ?, updated = ? WHERE id = ?`)
      .run(value, updatedTime, key)
    // 检查 state.changes 或其他表示成功的属性，具体取决于 db0 连接器
    // 对于某些连接器，run() 返回的对象可能没有 success 属性
    // 这里保留原有逻辑，但请注意兼容性
    // if (!state || state.changes === 0) throw new Error(`set user ${key} data failed: No rows updated`); // 示例：检查更新行数
    logger.success(`set ${key} data`)
  }

  /**
   * 获取用户关联的数据字段和更新时间
   * @param id - 用户 ID
   * @returns {Promise<{ data: string; updated: number }>} 用户数据和更新时间
   * @throws {Error} 如果用户不存在
   */
  async getData(id: string) {
    const row: any = await this.db
      .prepare(`SELECT data, updated FROM user WHERE id = ?`)
      .get(id)
    if (!row) throw new Error(`user ${id} not found`)
    logger.success(`get ${id} data`)
    return row as {
      data: string
      updated: number
    }
  }

  /**
   * 删除用户
   * @param key - 用户 ID
   * @returns {Promise<any>} 删除结果
   * @throws {Error} 如果删除失败
   */
  async deleteUser(key: string) {
    const _state = await this.db
      .prepare(`DELETE FROM user WHERE id = ?`)
      .run(key)
    // 检查 _state.changes 或其他表示成功的属性
    // if (!_state || _state.changes === 0) throw new Error(`delete user ${key} failed: No rows deleted`); // 示例：检查删除行数
    logger.success(`delete user ${key}`)
  }
}

// 注意：getCacheTable 函数应该在另一个文件中定义，例如 server/database/index.ts 或类似的入口文件
// 这里只是 UserTable 类的定义
