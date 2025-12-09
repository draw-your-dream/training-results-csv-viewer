## CSV Viewer

一个零依赖的前端应用，可上传/拖拽本地 CSV、浏览服务器 `server-data/` 目录，并提供图片预览、缩放与旋转等交互。页面使用纯 HTML/CSS/TypeScript 构建，可直接部署到任何静态站点。

### 功能亮点
- 本地 & 服务器 CSV：支持文件选择、拖拽，以及像文件资源管理器一样层级浏览 `server-data/`。
- 深链直达：访问 `https://mydomain.com/path/to/file.csv` 会直接渲染对应的服务器 CSV，同时阻止直接访问 `/server-data/...`。
- 图片增强：自动识别 URL 并内嵌图片，提供放大、缩小、重置、旋转、拖拽、滚轮缩放及预览遮罩。
- 表格视图切换：加载服务器 CSV 后，界面切换为全屏表格并显示可分享的链接和返回按钮。

### 开发与构建
```bash
yarn install        # 安装依赖
yarn dev            # 以 --watch 模式编译 TypeScript
yarn build          # 生成生产版 app.js
```

`tsconfig.json` 将 `src/app.ts` 输出到项目根目录（覆盖现有的 `app.js`）。开发时可在一个终端运行 `yarn dev`，另开一个静态服务器（例如 `npx serve .`）便于在浏览器测试。

### 静态资源结构
- `index.html`：SPA 框架，所有深链导航都会被 service worker 重写回此文件。
- `styles.css`：界面样式及响应式布局。
- `app.js`：TypeScript 编译结果，负责状态管理、CSV 解析、路由和图片预览。
- `service-worker.js`：拦截导航请求，确保 `/server-data/...` 返回 404，同时让虚拟 CSV 路径回退到 `index.html`。
- `server-data/`：在服务器上暴露的静态 CSV 目录（可含子目录）。

### 预览 & 深链
1. 启动任意静态服务器根目录指向本项目（例如 `yarn dev & npx serve .`）。
2. 在浏览器访问 `http://localhost:3000/test-subfolder/test-sub.csv` 之类的路径。
3. 首屏直接显示表格视图；从左上角“返回”可回到服务器浏览器界面。

### 部署提示
- 将整个目录上传到静态托管（如 Vercel、Netlify、自建 Nginx）。
- 确保入口路由全部回退到 `index.html`，或者保留 `service-worker.js` 负责处理导航请求。
- 如需从服务器端动态生成 `server-data/`，只需保证最终对外暴露为静态目录即可，无需改动前端代码。
