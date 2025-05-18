/**
 * 为 Cloudflare Workers 构建项目
 * 确保客户端构建完成后再进行服务器端构建
 */
import { execSync } from "node:child_process"
import { dirname, join } from "node:path"
import { copyFileSync, existsSync, mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import process from "node:process" // 导入 process 模块

/**
 * 获取项目根目录
 * @returns {string} 项目根目录路径
 */
function getProjectDir() {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)
  return join(__dirname, "..")
}

const projectDir = getProjectDir()

/**
 * 主函数 - 执行构建流程
 */
function main() {
  console.log("运行预处理脚本...")
  execSync("tsx ./scripts/favicon.ts && tsx ./scripts/source.ts", {
    stdio: "inherit",
  })

  // 先构建客户端
  console.log("构建客户端...")
  process.env.VITE_CLIENT_ONLY = "1" // 使用导入的 process
  execSync("vite build", { stdio: "inherit" })

  // 确保输出目录存在
  const indexHtmlPath = join(projectDir, "dist/index.html")
  const outputDir = join(projectDir, "dist/output/public")

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  // 复制 index.html 到输出目录
  if (existsSync(indexHtmlPath)) {
    console.log("复制 index.html 到输出目录...")
    copyFileSync(indexHtmlPath, join(outputDir, "index.html"))
  } else {
    console.error("找不到 index.html 文件:", indexHtmlPath)
    process.exit(1) // 使用导入的 process
  }

  // 构建服务器端
  console.log("构建服务器端...")
  process.env.VITE_CLIENT_ONLY = "" // 使用导入的 process
  process.env.CF_WORKERS = "1" // 使用导入的 process
  execSync("vite build", { stdio: "inherit" })

  console.log("构建完成！")
}

// 执行主函数
main()
