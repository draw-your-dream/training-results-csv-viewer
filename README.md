## CSV Viewer

一个基于 **Next.js 14 + React 18 + TypeScript** 的现代化 CSV 浏览器。它聚焦“所见即所得”的表格预览，支持服务器目录漫游、本地上传、图片/链接识别、可视化列控制与可分享的深链，非常适合部署在需要快速验数或联调静态资源的场景。

### 技术栈
- Next.js App Router，所有页面均为 `app/[[...virtual]]` 动态段。
- 纯 React/TypeScript，未额外引入第三方表格依赖。
- Tailored CSS（`app/globals.css`）覆盖拖拽、预览和响应式布局。
- 自实现的轻量 CSV 解析器（`lib/csv.ts`），可处理引号、换行和转义。

## 功能特性
- **多数据源**：拖拽/选择本地 CSV、载入示例、从剪贴板粘贴，或浏览 `public/server-data` 下的服务器文件。
- **深链与分享**：直接访问 `https://host/server-data/foo/bar.csv`，中间件会将请求重写到首页并带上虚拟路径，表格自动加载并生成可复制的分享链接。
- **富媒体单元格**：自动识别图片或 URL；服务器 CSV 可引用 `./image.png` 这类相对路径，渲染出的图片支持点击放大、拖拽、缩放、旋转与复位。
- **列操作工具箱**：
  - 拖拽列宽（默认 `min(320px, containerWidth / 可见列数)`）并立即应用到表体。
  - 抓取列头即可排序，悬浮预览条实时显示即将落位的位置，释放后整列会重新排布。
  - 面板勾选列的显示/隐藏，至少保留一列可见；隐藏列在刷新时仍会被记忆。
  - 点击“刷新”重新抓取服务器端 CSV，同时保留列宽、顺序与显示状态。
- **服务器资源解析**：`resolveServerAssetPath` 支持绝对 URL、`data:`、`/server-data/**` 和 `./相对路径`，并在服务端与客户端两侧做了越界保护。
- **状态与回退**：顶部状态消息实时反馈读写结果，随时可以返回服务器浏览视图或重新选择本地文件。

## 快速开始
```bash
# 1. 安装依赖
npm install   # Node.js 18+

# 2. 启动开发服务器
npm run dev   # http://localhost:3000

# 3. 质量检测与构建
npm run lint
npm run build
npm run start # 生产模式（需先 build）
```
也可使用 `pnpm` 或 `yarn`，指令保持一致。

## 数据来源与深链
### 本地上传
拖拽或通过“选择 CSV 文件”按钮导入。文件内容只存在浏览器内存，不会上传到服务器；导入后地址栏会被重置为 `/`，防止误分享本地数据。

### 服务器目录
默认（本地模式）会读取 `public/server-data/`，并可通过 `/server-data/**` 访问其中的静态资源。
如需改为浏览 **S3**，设置 `S3_SERVER_DATA_ROOT=s3://bucket/prefix/`：目录与 CSV 内容将从该 S3 前缀读取，且 `/server-data/**` 会在服务端 302 跳转到对应对象的签名 URL（用于图片等资产）。

### 深链 & 分享
`middleware.ts` 会截获浏览器直接访问 `/server-data/foo.csv` 的 HTML 请求，并重写到 `/`，同时注入 `virtual` 查询参数。`app/[[...virtual]]/page.tsx` 读取该参数并传给 `CsvViewerApp`，从而自动加载目标 CSV。右上角的文件链接可被复制或在新标签中打开，实现“所见即所得”的分享体验。

## 使用技巧
- **列宽拖拽**：抓住列头右侧的灰色分隔条即可调整；拖拽过程中 `body` 会带有 `is-resizing-column` 类以改变指针样式。
- **列排序**：按住列头即可拖动，顶部漂浮预览条实时显示排序结果，松手后整张表会同步更新。
- **列显示/隐藏**：在“列显示”面板勾选列名即可控制，始终至少保留一列以避免出现空表。
- **服务器浏览刷新**：面板右上“刷新”重新读取当前目录；表格内的“刷新”则重新获取当前 CSV。
- **图片预览**：单击图片单元格可打开预览浮层，支持鼠标滚轮缩放、按钮缩放/旋转、拖拽平移，以及一键重置。

## 目录结构
```
app/
  [[...virtual]]/page.tsx   # 捕获 / 与任意深链 CSV
  api/server-data/route.ts  # 本地读取 public/server-data；或在 S3 模式下列举 S3 前缀
  api/server-data-file/route.ts # 本地读取 CSV；或在 S3 模式下 GetObject
  api/s3-presign/route.ts   # 为 s3://... 生成临时访问并 302 跳转
  server-data/[...path]/route.ts # 本地透传 /server-data/**；或在 S3 模式下 302 跳转到签名 URL
  globals.css               # 全局与交互样式
components/
  CsvViewerApp.tsx          # 主 UI、状态管理与数据源逻辑
  CsvTable.tsx              # 表格渲染、列宽/排序、多媒体单元格
lib/
  csv.ts                    # 轻量 CSV 解析器
public/server-data/         # 可公开的 CSV 与关联资产
middleware.ts               # 深链重写与 HTML 请求识别
```

## API 与中间件
- `GET /api/server-data?path=server-data/foo/`：本地模式基于 `fs.readdir` 读取 `public/server-data`；设置 `S3_SERVER_DATA_ROOT` 时改为列举对应 S3 prefix（并阻止越界路径）。
- `GET /api/server-data-file?path=server-data/foo.csv`：读取 CSV 文本（本地或 S3）。
- `GET /api/s3-presign?uri=s3://bucket/key`：生成临时访问 URL 并 302 跳转（用于 CSV 内嵌的 S3 资源）。
- `middleware.ts`：只对 `Accept: text/html` 的 `GET` 请求生效，避免干扰对 `/server-data/**` 的静态资源访问；其余请求直接透传。
- `CsvViewerApp` 在客户端通过 `fetch(/api/server-data)` 和 `fetch(/api/server-data-file)` 读取目录与 CSV；图片等资产通过 `/server-data/**`（本地直读或 S3 签名跳转）。

## 部署
1. 运行 `npm run build` 生成 `.next`.
2. 选择托管方式：
   - **Vercel / Netlify / Railway**：直接导入仓库即可，默认 Node.js 18。
   - **自托管**：将产物与 `package.json` 一并上传，执行 `npm run start`，或封装到 Docker/PM2。
3. 数据来源二选一：
   - **本地模式**：确保 `public/server-data` 目录同步到服务器（含图片等资产），否则服务器浏览面板会显示为空。
   - **S3 模式**：设置 `S3_SERVER_DATA_ROOT=s3://bucket/prefix/`，并提供对应的 AWS/S3 凭证（以及可选的 `S3_ENDPOINT`/`S3_FORCE_PATH_STYLE`）。
4. 如需限制 `/server-data/**` 的静态访问，可在 CDN / Nginx / Apache 中添加鉴权或 rewrite，再在 `app/api/server-data` 中实现对应校验。

## 常见问题
- **访问 CSV 时浏览器触发下载**：请确保通过 `/` 或 `/server-data/foo.csv` 访问，并保持路径大小写正确；否则静态服务器会直接返回文件。
- **列拖拽时指针抖动**：检查浏览器扩展是否拦截指针事件，或确保页面未被 iframe 限制。
- **图片无法加载**：相对路径需要以 `./` 开头，且文件必须存在于 `public/server-data` 内；跨域 URL 需确认允许匿名访问。
- **目录为空或报错**：`/api/server-data` 仅允许读取 `public/server-data`，确保部署目标具备读权限，并且路径未含中文空格等被过滤的字符。

欢迎根据业务需要扩展 API、接入鉴权或替换 CSV 解析逻辑，愿它帮你提升 CSV 交付效率。Enjoy! 🎉
