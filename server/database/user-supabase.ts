import { supabase } from "./supabase"
import type { UserInfo } from "#/types"

export class UserTable {
  /**
   * 初始化用户表
   */
  async init() {
    // Supabase 会自动创建表，这里不需要手动创建
    const { error } = await supabase.from("user").select("id").limit(1)
    if (error?.message.includes("relation \"user\" does not exist")) {
      await supabase.query(`
        CREATE TABLE IF NOT EXISTS user (
          id TEXT PRIMARY KEY,
          email TEXT,
          data TEXT,
          type TEXT,
          created BIGINT,
          updated BIGINT
        );
        CREATE INDEX IF NOT EXISTS idx_user_id ON user(id);
      `)
    }
  }

  /**
   * 添加用户
   */
  async addUser(id: string, email: string, type: "github") {
    const now = Date.now()
    const { data: existingUser } = await supabase
      .from("user")
      .select()
      .eq("id", id)
      .single()

    if (!existingUser) {
      const { error } = await supabase.from("user").insert({
        id,
        email,
        data: "",
        type,
        created: now,
        updated: now,
      })
      if (error) throw error
    } else if (existingUser.email !== email || existingUser.type !== type) {
      const { error } = await supabase
        .from("user")
        .update({ email, updated: now })
        .eq("id", id)
      if (error) throw error
    }
  }

  /**
   * 获取用户信息
   */
  async getUser(id: string): Promise<UserInfo> {
    const { data, error } = await supabase
      .from("user")
      .select("id, email, data, created, updated")
      .eq("id", id)
      .single()

    if (error) throw error
    return data as UserInfo
  }

  /**
   * 设置用户数据
   */
  async setData(key: string, value: string, updatedTime = Date.now()) {
    const { error } = await supabase
      .from("user")
      .update({ data: value, updated: updatedTime })
      .eq("id", key)

    if (error) throw error
  }

  /**
   * 获取用户数据
   */
  async getData(id: string) {
    const { data, error } = await supabase
      .from("user")
      .select("data, updated")
      .eq("id", id)
      .single()

    if (error) throw error
    return data as {
      data: string
      updated: number
    }
  }

  /**
   * 删除用户
   */
  async deleteUser(key: string) {
    const { error } = await supabase.from("user").delete().eq("id", key)

    if (error) throw error
  }
}
