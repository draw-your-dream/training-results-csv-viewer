## CSV Viewer

一个基于 **Next.js + React + TypeScript** 的现代化 CSV 浏览器。它专注于在浏览器内即时展示 CSV 数据，支持本地上传、服务器目录浏览、图片/链接识别以及交互式列控制，适合部署到任意支持 Node.js 或静态托管的环境。

## 功能特性
- **多数据源**：支持拖拽/选择本地 CSV、粘贴内容、加载示例文件，以及浏览 `public/server-data` 目录中的服务器 CSV。
- **深链进入**：直接访问 `https://host/path/to/file.csv` 即可跳转到对应表格视图，并生成可分享链接。
- **富媒体单元格**：自动识别图片与 URL，图片会在列宽范围内自适应并可点击放大、拖拽预览；纯文本维持等宽对齐。
- **列操作工具箱**：
  - 拖拽列宽，默认宽度取 `min(320px, 自动铺满剩余空间)`。
  - 列头拖拽排序（仅预览列头，主体列不会跟随移动）。
  - 勾选显示/隐藏列。
  - 右上角“重置”按钮可恢复列宽、可见性与排序的初始状态。
- **服务器相对资源**：在 CSV 中填写 `./foo/bar.png` 这类相对 `public/server-data/` 的路径即可渲染本地图片，从而方便管理菜单、素材等静态资源。
- **体验细节**：加载状态平滑、无路由闪动；列拖拽带有跟随鼠标的预览；图片列会自动填满当前列宽；表格容器允许横向拖动查看剩余列。

## 快速开始
```bash
# 1. 安装依赖
npm install

# 2. 开发模式
npm run dev
# 默认运行在 http://localhost:3000

# 3. 代码校验 & 构建
npm run lint
npm run build
npm run start   # 生产模式（需先 build）
```

要求 Node.js 18+（与当前 Next.js 版本一致），使用 npm、pnpm 或 yarn 均可。

## 数据准备
### 本地上传
直接拖拽或点击选择 CSV 文件，表格会即时渲染，数据仅存在浏览器内存中。

### 服务器目录
将 CSV 和关联资源放入 `public/server-data/`，部署后可通过 `/server-data/**` 静态访问。应用内的“服务器浏览”面板会列出该目录结构，并支持子目录与面包屑导航。

### 引用服务器图片
在服务器 CSV 的单元格中填写相对路径：
```
./output_0.png
./subfolder/photo.jpg
```
解析时会映射到 `public/server-data/output_0.png` 等文件，并在表格中渲染为图片。

## 使用技巧
- **列宽拖拽**：拖动列右侧的灰色分隔手柄即可调整。拖动时 body 会进入 `is-resizing-column` 状态，鼠标样式会变化。
- **列排序**：抓住列头开始拖拽，顶部会出现一个半透明的列头预览，只有预览栏会随鼠标移动，松手时根据预览位置更新顺序。
- **列显示/隐藏**：在“列管理”面板勾选列名即可控制展示状态。
- **重置视图**：点击 table-view header 右侧的“重置”按钮，可恢复当前 CSV 的默认列宽、列可见性与列顺序，并强制重新挂载表格。

## 目录结构
```
app/
  [[...virtual]]/page.tsx   # 捕获所有路径，用于深链和首页
  api/server-data/route.ts  # 读取 public/server-data 的 API
  globals.css               # 全局样式与表格交互样式
components/
  CsvViewerApp.tsx          # 主界面与状态管理
  CsvTable.tsx              # 表格渲染、列操作、单元格内容解析
lib/
  csv.ts                    # 轻量级 CSV 解析器
public/server-data/         # 服务器侧可访问的数据源与资源
```

## 部署
1. 执行 `npm run build` 生成 `.next`.
2. 选择任意托管方式：
   - **Vercel / Netlify**：直接导入仓库或上传构建产物。
   - **自托管**：使用 `npm run start` 启动应用，或通过 Docker/PM2 等方式托管。
3. 确保 `public/server-data` 被同步到服务器，以便 API 与静态访问正常工作。
4. 如果需要限制 `/server-data/**` 的直接访问，可在 CDN / Nginx / Apache 层添加鉴权或 rewrite 规则，前端 API 可以扩展以读取受保护的目录。

## 常见问题
- **访问 CSV 时出现下载**：请通过应用入口（如 `/` 或 `/server-data/xxx.csv`）打开，Next.js 会捕获请求并渲染表格；多余的 `//` 或路径拼写错误会导致静态服务器兜底下载。
- **列拖动闪动**：列头拖拽完全基于浮动预览；若出现震荡，可检查浏览器是否启用某些影响指针事件的扩展。
- **图片无法显示**：确认 CSV 中的路径以 `./` 开头，且对应文件已存在 `public/server-data`。如使用绝对 URL，需确保可跨域访问。

欢迎根据业务需求扩展 API、接入鉴权或替换 CSV 解析逻辑。Enjoy! 🎉
