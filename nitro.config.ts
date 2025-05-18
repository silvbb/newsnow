import process from "node:process"
import { join } from "node:path"
import viteNitro from "vite-plugin-with-nitro"
import { RollopGlob } from "./tools/rollup-glob"
import { projectDir } from "./shared/dir"

const nitroOption: Parameters<typeof viteNitro>[0] = {
  experimental: {
    database: true,
  },
  rollupConfig: {
    plugins: [RollopGlob()],
  },
  sourceMap: false,
  // 将 'pg-native' 添加到 externals 列表中
  // 这告诉 Nitro 在构建时将 'pg-native' 视为外部模块，不进行打包
  // externals: {
  //   external: ["pg-native"],
  // },
  // 默认配置，可以在本地开发时使用 SQLite 或其他数据库
  // 或者在这里直接配置为 Supabase (PostgreSQL) 用于本地开发
  database: {
    default: {
      connector: "better-sqlite3",
      // 本地开发数据库文件路径
      options: {
        url: "file:./.data/db.sqlite",
      },
    },
  },
  devDatabase: {
    default: {
      connector: "better-sqlite3",
      // 本地开发数据库文件路径
      options: {
        url: "file:./.data/db.sqlite",
      },
    },
  },
  imports: {
    dirs: ["server/utils", "shared"],
  },
  preset: "node-server",
  alias: {
    "@shared": join(projectDir, "shared"),
    "#": join(projectDir, "server"),
  },
}

// Vercel 或 Cloudflare Pages 环境使用 Supabase (PostgreSQL)
if (process.env.VERCEL || process.env.CF_PAGES) {
  // 根据平台设置预设
  if (process.env.VERCEL) {
    nitroOption.preset = "vercel"
  } else if (process.env.CF_PAGES) {
    nitroOption.preset = "cloudflare-pages"
    // Cloudflare Pages 可能需要这个 unenv 配置
    nitroOption.unenv = {
      alias: {
        "safer-buffer": "node:buffer",
      },
    }
  }

  // 配置 db0 使用 postgresql 连接器连接 Supabase
  nitroOption.database = {
    default: {
      connector: "postgresql",
      options: {
        // 从环境变量中读取 Supabase 连接字符串
        url: process.env.DATABASE_URL,
      },
    },
  }
  // 部署环境的 devDatabase 通常不重要，但可以保持与 database 一致
  nitroOption.devDatabase = nitroOption.database
} else if (process.env.BUN) {
  nitroOption.preset = "bun"
  nitroOption.database = {
    default: {
      connector: "bun-sqlite",
    },
  }
} else {
  // 本地开发环境 (没有 VERCEL, CF_PAGES, BUN 环境变量时)
  // 配置 devDatabase 使用 postgresql 连接器连接 Supabase
  nitroOption.devDatabase = {
    default: {
      connector: "postgresql",
      options: {
        // 从环境变量中读取 Supabase 连接字符串
        url: process.env.DATABASE_URL,
        // 从环境变量中读取 Supabase 连接信息并分别配置
        // user: process.env.PGUSER || "postgres.sylogelopxjixuxpwwzp", // 您的 Supabase 用户名
        // password: process.env.PGPASSWORD || "Newsnow@lfg1024.db", // 您的 Supabase 密码
        // host: process.env.PGHOST || "aws-0-ap-southeast-1.pooler.supabase.com", // Supabase 连接池主机
        // port: process.env.PGPORT ? parseInt(process.env.PGPORT) : 6543, // Supabase 连接池端口
        // database: process.env.PGDATABASE || "postgres", // 数据库名
        // 如果需要 SSL/TLS 连接，可能还需要配置 ssl 选项
        // ssl: { rejectUnauthorized: false }, // 根据 Supabase 的要求配置
      },
    },
  }
  // 本地开发环境的 database 配置通常不使用，但可以保持默认或与 devDatabase 一致
  // nitroOption.database = nitroOption.devDatabase;
}

export default function () {
  return viteNitro(nitroOption)
}
