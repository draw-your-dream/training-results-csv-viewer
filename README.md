## CSV Viewer (Next.js 版本)

使用 Next.js + React + TypeScript 重写的 CSV Viewer。延续原有“上传/拖拽 CSV、本地 & 服务器目录浏览、图片预览”等特性，并通过 API Route 直接读取 `public/server-data`，不再依赖目录索引解析，结构更清晰，可直接部署到 Vercel、Netlify、Nginx 等任意支持 Node/静态资源的环境。

### 功能亮点
- **本地处理**：拖拽或选择 CSV 文件即时渲染；保留示例数据一键加载。
- **服务器浏览**：React 版文件浏览器列出 `public/server-data` 的层级结构，支持子目录、面包屑与刷新。
- **深链直达**：访问 `https://your-host.com/foo/bar.csv` 这类路径会直接进入表格视图，并给出可分享链接。
- **富媒体单元格**：自动识别图片 / URL，带缩放、旋转、拖拽的全屏图片预览，大表格亦可滚动浏览。
- **服务器相对资源**：在服务器 CSV 中可填写 `./foo/bar.png`（相对于 `server-data/`）等路径来引用本地图片文件。

### 开发命令
```bash
npm install          # 安装依赖
npm run dev          # 启动 Next.js 开发服务器（默认 http://localhost:3000）
npm run lint         # 可选：运行 ESLint
npm run build        # 生产构建
npm run start        # 以生产模式启动（需先 build）
```

### 目录结构
```
app/
  [[...virtual]]/page.tsx   # 捕获所有路径的页面，负责深链加载
  api/server-data/route.ts  # 读取 public/server-data 的 API
  globals.css               # 继承原样式
components/
  CsvViewerApp.tsx          # 主界面+状态管理（client component）
  CsvTable.tsx              # 表格渲染与单元格内容识别
lib/
  csv.ts                    # 轻量 CSV 解析器
public/server-data/         # 示例 CSV 与可共享的静态资源
```

### 部署提示
- 构建输出为标准 Next.js 应用，可直接部署到 Vercel/Netlify，也可通过 `npm run build && npm run start` 自行托管。
- 所有静态 CSV 放在 `public/server-data`，部署后访问路径即 `https://host/server-data/xxx.csv`，前端通过 `/api/server-data` 列出目录。
- 如需动态生成 CSV，可在构建或运行阶段写入 `public/server-data`，或扩展 API route 以读取其他目录。
- 深链依赖 Next.js 的 catch-all 路由，无需额外的 service worker 重写逻辑。
- 若需禁止浏览器直接访问 `/server-data/**`，请在宿主服务器或 CDN 上配置鉴权/重写策略（当前实现默认将其公开为静态资源）。
