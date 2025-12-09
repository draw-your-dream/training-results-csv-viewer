const fileInput = document.getElementById("csvFile") as HTMLInputElement | null;
const dropZone = document.getElementById("dropZone");
const statusEl = document.getElementById("status");
const tableWrapper = document.getElementById("tableWrapper");
const tableEl = document.getElementById("csvTable") as HTMLTableElement | null;
const sampleBtn = document.getElementById("sampleBtn");
const previewOverlay = document.getElementById("previewOverlay");
const previewImage = document.getElementById("previewImage") as HTMLImageElement | null;
const previewCaption = document.getElementById("previewCaption");
const previewClose = document.getElementById("previewClose");
const previewToolbar = document.querySelector(".preview-toolbar");
const previewImageWrapper = document.querySelector(".preview-image-wrapper");
const zoomIndicator = document.getElementById("zoomIndicator");
const serverExplorerList = document.getElementById("serverExplorerList");
const serverBreadcrumb = document.getElementById("serverBreadcrumb");
const serverRefreshBtn = document.getElementById("serverRefreshBtn");
const tableSection = document.getElementById("tableSection");
const tableBackBtn = document.getElementById("tableBackBtn");
const tableFileLabel = document.getElementById("tableFileLabel");
const tableFilePath = document.getElementById("tableFilePath");

const SAMPLE_CSV = `名称,描述,图片
咖啡,新鲜烘焙的手冲咖啡,https://images.unsplash.com/photo-1459257868276-5e65389e2722?auto=format&fit=crop&w=400&q=60
甜甜圈,"招牌草莓酱, 甜而不腻",https://images.unsplash.com/photo-1483695028939-5bb13f8648b0?auto=format&fit=crop&w=400&q=60
海报,下载链接,https://raw.githubusercontent.com/github/explore/main/topics/javascript/javascript.png`;

type CsvRow = string[];

type TableSection = HTMLTableSectionElement | null;

function invariant<T>(value: T | null, message: string): T {
  if (value == null) {
    throw new Error(message);
  }
  return value;
}

const requiredFileInput = invariant(fileInput, "未找到文件输入元素");
const requiredDropZone = invariant(dropZone, "未找到拖拽区域");
const requiredStatus = invariant(statusEl, "未找到状态区域");
const requiredTableWrapper = invariant(tableWrapper, "未找到表格容器");
const requiredTable = invariant(tableEl, "未找到表格元素");
const requiredSampleBtn = invariant(sampleBtn, "未找到示例按钮");
const requiredPreviewOverlay = invariant(previewOverlay, "未找到预览层");
const requiredPreviewImage = invariant(previewImage, "未找到预览图片元素");
const requiredPreviewCaption = invariant(previewCaption, "未找到预览描述元素");
const requiredPreviewClose = invariant(previewClose, "未找到预览关闭按钮");
const requiredPreviewToolbar = invariant(
  previewToolbar as HTMLDivElement | null,
  "未找到预览控制面板"
);
const requiredPreviewWrapper = invariant(
  previewImageWrapper as HTMLDivElement | null,
  "未找到预览图片容器"
);
const requiredZoomIndicator = invariant(zoomIndicator, "未找到放大倍率指示器");
const requiredServerExplorerList = invariant(serverExplorerList, "未找到服务器浏览列表");
const requiredServerBreadcrumb = invariant(serverBreadcrumb, "未找到服务器面包屑");
const requiredServerRefreshBtn = invariant(serverRefreshBtn, "未找到服务器刷新按钮");
const requiredTableSection = invariant(tableSection, "未找到表格视图容器");
const requiredTableBackBtn = invariant(tableBackBtn, "未找到表格视图返回按钮");
const requiredTableFileLabel = invariant(tableFileLabel, "未找到表格标题元素");
const requiredTableFilePath = invariant(tableFilePath, "未找到表格路径元素");

const SERVER_ROOT_DIR = "server-data/";
const MIN_SCALE = 0.1;
const MAX_SCALE = 6;
function detectAppBaseUrl(): URL {
  const currentScript = document.currentScript;
  if (currentScript instanceof HTMLScriptElement && currentScript.src) {
    return new URL("./", currentScript.src);
  }

  const fallbackScript =
    (document.querySelector('script[src*="app.js"]') as HTMLScriptElement | null) ??
    (document.querySelector("script[src]") as HTMLScriptElement | null);

  if (fallbackScript?.src) {
    return new URL("./", fallbackScript.src);
  }

  return new URL("/", window.location.href);
}

const APP_BASE_URL = detectAppBaseUrl();
const APP_BASE_PATH = APP_BASE_URL.pathname.endsWith("/")
  ? APP_BASE_URL.pathname
  : `${APP_BASE_URL.pathname}/`;
const SERVICE_WORKER_URL = new URL("service-worker.js", APP_BASE_URL).pathname;
const INITIAL_VIRTUAL_PATH = extractVirtualPathFromLocation();

type PreviewState = {
  scale: number;
  rotation: number;
  baseScale: number;
  translateX: number;
  translateY: number;
};

type HistoryState = {
  virtualPath: string | null;
  label?: string;
};

const previewState: PreviewState = {
  scale: 1,
  rotation: 0,
  baseScale: 1,
  translateX: 0,
  translateY: 0,
};

let isDraggingImage = false;
let dragPointerId: number | null = null;
let dragStartX = 0;
let dragStartY = 0;
let dragOriginX = 0;
let dragOriginY = 0;

let currentServerPath = SERVER_ROOT_DIR;
let currentCsvLabel = "CSV 预览";
let currentVirtualCsvPath: string | null = null;

function isCsvFile(path: string): boolean {
  return path.toLowerCase().endsWith(".csv");
}

function renderExplorerMessage(message: string): void {
  requiredServerExplorerList.innerHTML = "";
  const div = document.createElement("div");
  div.className = "server-explorer-empty";
  div.textContent = message;
  requiredServerExplorerList.appendChild(div);
}

function resolveAppHref(relativePath: string): string {
  return new URL(relativePath, APP_BASE_URL).href;
}

function buildPublicUrl(virtualPath: string | null): string {
  const base = APP_BASE_PATH === "/" ? "" : APP_BASE_PATH.replace(/\/$/, "");
  if (!virtualPath) {
    return APP_BASE_PATH;
  }
  const trimmedVirtual = virtualPath.replace(/^\/+/, "");
  const prefix = base ? `${base}/` : "/";
  return `${prefix}${trimmedVirtual}`;
}

function extractVirtualPathFromLocation(): string | null {
  let pathname = window.location.pathname;
  const base = APP_BASE_PATH === "/" ? "" : APP_BASE_PATH.replace(/\/$/, "");
  if (base && pathname.startsWith(base)) {
    pathname = pathname.slice(base.length);
    if (!pathname.startsWith("/")) {
      pathname = `/${pathname}`;
    }
  }
  if (!pathname || pathname === "/" || pathname === APP_BASE_PATH || pathname === base) {
    return null;
  }
  return decodeURIComponent(pathname);
}

function toVirtualPath(serverPath: string): string {
  const trimmed = serverPath.replace(/^server-data\/?/, "");
  return `/${trimmed.replace(/^\/+/, "")}`;
}

function toServerPath(virtualPath: string): string {
  const trimmed = virtualPath.replace(/^\/+/, "");
  return trimmed ? `${SERVER_ROOT_DIR}${trimmed}` : SERVER_ROOT_DIR;
}

function deriveLabelFromVirtualPath(virtualPath: string): string {
  const segments = virtualPath.split("/").filter(Boolean);
  return segments[segments.length - 1] || "CSV 预览";
}

function showTableSection(label: string, virtualPath?: string | null): void {
  currentCsvLabel = label;
  currentVirtualCsvPath = virtualPath ?? null;
  requiredTableFileLabel.textContent = label;
  if (virtualPath) {
    const publicUrl = buildPublicUrl(virtualPath);
    requiredTableFilePath.textContent = publicUrl;
    requiredTableFilePath.setAttribute("href", publicUrl);
  } else {
    requiredTableFilePath.textContent = "";
    requiredTableFilePath.removeAttribute("href");
  }
  requiredTableSection.hidden = false;
  requiredTableWrapper.hidden = false;
  document.body.classList.add("table-view-active");
}

function hideTableSection(): void {
  currentVirtualCsvPath = null;
  requiredTableSection.hidden = true;
  requiredTableWrapper.hidden = true;
  requiredTableFilePath.textContent = "";
  requiredTableFilePath.removeAttribute("href");
  document.body.classList.remove("table-view-active");
}

function renderTableLoadingState(): void {
  requiredTable.innerHTML = `<tbody><tr><td class="table-loading-cell">正在加载 CSV …</td></tr></tbody>`;
  requiredTableWrapper.hidden = false;
}

function updateHistoryState(virtualPath: string | null, label?: string, replace = false): void {
  const url = buildPublicUrl(virtualPath);
  const state: HistoryState = { virtualPath, label };
  if (replace) {
    history.replaceState(state, "", url);
  } else {
    history.pushState(state, "", url);
  }
}

function navigateToExplorerRoot(pushHistory = true): void {
  if (pushHistory) {
    updateHistoryState(null, undefined, false);
  } else {
    updateHistoryState(null, undefined, true);
  }
  hideTableSection();
}

type DirectoryEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
};

function normalizeDirectoryPath(path: string): string {
  let normalized = path.trim();
  normalized = normalized.replace(/^[.][/]/, "");
  if (!normalized.endsWith("/")) {
    normalized += "/";
  }
  if (normalized.startsWith("/")) {
    normalized = normalized.slice(1);
  }
  return normalized;
}

function toAppRelativePath(url: URL): string | null {
  const baseDir = new URL("./", window.location.href).pathname;
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.startsWith(baseDir)) {
    pathname = pathname.slice(baseDir.length);
  } else {
    pathname = pathname.replace(/^\//, "");
  }
  if (!pathname) {
    return null;
  }
  return pathname;
}

function parseHtmlDirectoryListing(html: string, requestPath: string): DirectoryEntry[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const baseUrl = new URL(requestPath, window.location.href);
  const normalizedBase = normalizeDirectoryPath(requestPath);
  const entries: DirectoryEntry[] = [];
  const seen = new Set<string>();

  doc.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (!href || href === "../" || href === "./" || href.startsWith("?")) {
      return;
    }
    let url: URL;
    try {
      url = new URL(href, baseUrl);
    } catch (err) {
      return;
    }
    url.hash = "";
    const relativePath = toAppRelativePath(url);
    if (!relativePath || !relativePath.startsWith(SERVER_ROOT_DIR)) {
      return;
    }
    if (!relativePath.startsWith(normalizedBase)) {
      return;
    }
    const remainder = relativePath.slice(normalizedBase.length);
    if (!remainder) {
      return;
    }
    const remainderWithoutTrailingSlash = remainder.endsWith("/")
      ? remainder.slice(0, -1)
      : remainder;
    if (remainderWithoutTrailingSlash.includes("/")) {
      return;
    }
    if (seen.has(relativePath)) {
      return;
    }
    seen.add(relativePath);
    const isDirectory = url.pathname.endsWith("/");
    const nameText = anchor.textContent?.trim() ?? remainder;
    const name = nameText.replace(/\/$/, "");
    const path = isDirectory ? `${relativePath.replace(/\/?$/, "")}/` : relativePath;
    entries.push({ name, path, isDirectory });
  });

  return entries;
}

async function fetchDirectoryEntries(relativeDir: string): Promise<DirectoryEntry[]> {
  const target = normalizeDirectoryPath(relativeDir);
  const response = await fetch(resolveAppHref(target), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`无法访问 ${target} (状态 ${response.status})`);
  }
  const text = await response.text();
  return parseHtmlDirectoryListing(text, target);
}

function sortDirectoryEntries(entries: DirectoryEntry[]): DirectoryEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.path.localeCompare(b.path);
  });
}

function getParentDirectory(path: string): string | null {
  const normalized = normalizeDirectoryPath(path);
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return null;
  }
  parts.pop();
  return `${parts.join("/")}/`;
}

function renderBreadcrumb(path: string): void {
  requiredServerBreadcrumb.innerHTML = "";
  const normalized = normalizeDirectoryPath(path);
  const parts = normalized.split("/").filter(Boolean);

  if (!parts.length) {
    const root = document.createElement("button");
    root.type = "button";
    root.textContent = "server-data";
    root.classList.add("active");
    root.disabled = true;
    requiredServerBreadcrumb.appendChild(root);
    return;
  }

  let accumulated = "";
  parts.forEach((part, index) => {
    accumulated = accumulated ? `${accumulated}/${part}` : part;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = part;
    const targetPath = `${accumulated}/`;
    if (index === parts.length - 1) {
      button.classList.add("active");
      button.disabled = true;
    } else {
      button.addEventListener("click", () => {
        void loadServerDirectory(targetPath);
      });
    }
    requiredServerBreadcrumb.appendChild(button);
  });
}

function renderExplorerEntries(entries: DirectoryEntry[]): void {
  requiredServerExplorerList.innerHTML = "";
  const sorted = sortDirectoryEntries(entries).filter(
    (entry) => entry.isDirectory || isCsvFile(entry.path)
  );

  if (currentServerPath !== SERVER_ROOT_DIR) {
    const upButton = document.createElement("button");
    upButton.type = "button";
    upButton.className = "server-entry";
    upButton.innerHTML = `<span class="entry-type">返回</span><h3>上一级目录</h3>`;
    upButton.addEventListener("click", () => {
      const parent = getParentDirectory(currentServerPath) ?? SERVER_ROOT_DIR;
      void loadServerDirectory(parent);
    });
    requiredServerExplorerList.appendChild(upButton);
  }

  if (!sorted.length) {
    const empty = document.createElement("div");
    empty.className = "server-explorer-empty";
    empty.textContent = "该目录为空。";
    requiredServerExplorerList.appendChild(empty);
    return;
  }

  sorted.forEach((entry) => {
    const name = entry.name || entry.path.split("/").filter(Boolean).pop() || entry.path;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "server-entry";
    if (entry.isDirectory) {
      button.innerHTML = `<span class="entry-type">目录</span><h3>${name}</h3>`;
      button.addEventListener("click", () => {
        void loadServerDirectory(entry.path);
      });
    } else if (isCsvFile(entry.path)) {
      button.innerHTML = `<span class="entry-type">CSV</span><h3>${name}</h3>`;
      button.addEventListener("click", () => {
        void loadServerCsv(entry.path, { label: name, pushHistory: true });
      });
    } else {
      button.classList.add("disabled");
      button.innerHTML = `<span class="entry-type">文件</span><h3>${name}</h3><span>暂不支持</span>`;
      button.disabled = true;
    }
    requiredServerExplorerList.appendChild(button);
  });
}

async function loadServerDirectory(path: string, { silent = false } = {}): Promise<void> {
  const normalized = normalizeDirectoryPath(path);
  currentServerPath = normalized;
  renderExplorerMessage("正在加载目录…");
  renderBreadcrumb(normalized);
  try {
    const entries = await fetchDirectoryEntries(normalized);
    renderExplorerEntries(entries);
    if (!silent) {
      showStatus(`已打开 ${normalized}`);
    }
  } catch (error) {
    console.error(error);
    renderExplorerMessage("无法访问该目录。");
    showStatus("无法访问服务器目录。", true);
  }
}

async function initServerExplorer(initialVirtualPath: string | null): Promise<void> {
  try {
    if (initialVirtualPath) {
      await initializeRouting(initialVirtualPath, { suppressStatus: true });
      await loadServerDirectory(SERVER_ROOT_DIR, { silent: true });
    } else {
      await loadServerDirectory(SERVER_ROOT_DIR, { silent: true });
      await initializeRouting(null);
      showStatus("等待选择 CSV 文件…");
    }
  } finally {
    document.body.classList.remove("app-initializing");
  }
}

async function initializeRouting(
  initialVirtual: string | null = null,
  options: { suppressStatus?: boolean } = {}
): Promise<void> {
  const virtualPath = initialVirtual ?? extractVirtualPathFromLocation();
  if (virtualPath) {
    const label = deriveLabelFromVirtualPath(virtualPath);
    updateHistoryState(virtualPath, label, true);
    await loadServerCsv(toServerPath(virtualPath), {
      label,
      pushHistory: false,
      virtualPath,
      suppressStatus: Boolean(options.suppressStatus),
      focusTableView: true,
    });
    return;
  }
  updateHistoryState(null, undefined, true);
  hideTableSection();
}

async function loadServerCsv(
  serverPath: string,
  options: {
    label?: string;
    virtualPath?: string;
    pushHistory?: boolean;
    replaceHistory?: boolean;
    suppressStatus?: boolean;
    focusTableView?: boolean;
  } = {}
): Promise<void> {
  const absolutePath = resolveAppHref(serverPath);
  const virtualPath = options.virtualPath ?? toVirtualPath(serverPath);
  const label = options.label ?? deriveLabelFromVirtualPath(virtualPath);
  const suppressStatus = Boolean(options.suppressStatus);
  try {
    if (options.focusTableView ?? true) {
      showTableSection(label, virtualPath);
      renderTableLoadingState();
    }
    if (!suppressStatus) {
      showStatus(`正在从服务器读取 ${label} ...`);
    }
    const response = await fetch(absolutePath, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`服务器返回 ${response.status}`);
    }
    const text = await response.text();
    handleCSVText(text, label, virtualPath);
    if (options.pushHistory) {
      updateHistoryState(virtualPath, label);
    } else if (options.replaceHistory) {
      updateHistoryState(virtualPath, label, true);
    }
    if (!suppressStatus) {
      showStatus(`已加载 ${label}。`);
    }
  } catch (error) {
    console.error(error);
    showStatus("加载服务器 CSV 时遇到问题，请稍后重试。", true);
  }
}

function showStatus(message: string, isError = false): void {
  requiredStatus.textContent = message;
  requiredStatus.setAttribute("style", `color: ${isError ? "#d93025" : "#4d5560"}`);
}

function handleCSVText(text: string, label?: string, virtualPath?: string | null): void {
  try {
    const rows = parseCSV(text);
    if (!rows.length || rows.every((row) => row.every((cell) => !cell.trim()))) {
      requiredTableWrapper.hidden = true;
      hideTableSection();
      showStatus("CSV 内容为空，无法展示。");
      return;
    }
    renderTable(rows);
    showTableSection(label ?? "CSV 预览", virtualPath ?? null);
    showStatus(`成功载入 ${rows.length} 行数据。`);
  } catch (error) {
    console.error(error);
    requiredTableWrapper.hidden = true;
    hideTableSection();
    showStatus("解析 CSV 失败，请检查文件格式。", true);
  }
}

function loadFile(file?: File): void {
  if (!file) return;
  showStatus(`正在读取 ${file.name} ...`);
  const reader = new FileReader();
  reader.onload = (event) => {
    const result = event.target?.result;
    if (typeof result === "string") {
      handleCSVText(result, file.name, null);
      updateHistoryState(null, undefined, true);
    } else {
      showStatus("文件内容不是文本。", true);
    }
  };
  reader.onerror = () => {
    requiredTableWrapper.hidden = true;
    showStatus("读取文件时出现问题。", true);
  };
  reader.readAsText(file, "utf-8");
}

function parseCSV(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let row: CsvRow = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === "\"") {
      if (insideQuotes && nextChar === "\"") {
        current += "\"";
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  row.push(current);
  if (row.length > 1 || row[0]) {
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && !r[0].trim()));
}

function renderTable(rows: CsvRow[]): void {
  requiredTable.innerHTML = "";
  const [headerRow, ...bodyRows] = rows;

  if (headerRow) {
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");
    headerRow.forEach((value) => tr.appendChild(createCell(value, true)));
    thead.appendChild(tr);
    requiredTable.appendChild(thead);
  }

  const tbody = document.createElement("tbody");
  bodyRows.forEach((row) => {
    const tr = document.createElement("tr");
    const maxColumns = Math.max(headerRow?.length ?? 0, row.length);
    for (let i = 0; i < maxColumns; i += 1) {
      tr.appendChild(createCell(row[i] ?? ""));
    }
    tbody.appendChild(tr);
  });

  requiredTable.appendChild(tbody);
  requiredTableWrapper.hidden = false;
}

function createCell(value: string, isHeader = false): HTMLTableCellElement {
  const cell = document.createElement(isHeader ? "th" : "td");
  const trimmed = (value ?? "").trim();

  if (!trimmed) {
    cell.innerHTML = "&nbsp;";
    return cell;
  }

  if (isImageValue(trimmed)) {
    const img = createImageElement(trimmed, value);
    cell.appendChild(img);
    return cell;
  }

  if (isUrl(trimmed)) {
    const link = createLinkElement(trimmed);
    cell.appendChild(link);
    tryUpgradeLinkToImage(trimmed, link);
    return cell;
  }

  const span = document.createElement("span");
  span.textContent = value;
  span.className = "cell-text";
  cell.appendChild(span);
  return cell;
}

function isImageValue(value: string): boolean {
  const stripped = value.split("?")[0];
  const imageExtPattern = /\.(png|jpe?g|gif|bmp|webp|avif|svg)$/i;
  return value.startsWith("data:image/") || imageExtPattern.test(stripped);
}

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch (err) {
    return false;
  }
}

function createImageElement(src: string, caption?: string): HTMLImageElement {
  const img = document.createElement("img");
  img.src = src;
  img.alt = "CSV 图片";
  img.loading = "lazy";
  img.className = "cell-image";
  img.addEventListener("click", () => openImagePreview(src, caption ?? src));
  return img;
}

function createLinkElement(url: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = url;
  link.textContent = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "cell-link";
  return link;
}

function tryUpgradeLinkToImage(url: string, link: HTMLAnchorElement): void {
  const tester = new Image();
  tester.addEventListener(
    "load",
    () => {
      const imageEl = createImageElement(url);
      link.replaceWith(imageEl);
    },
    { once: true }
  );
  tester.addEventListener(
    "error",
    () => {
      tester.remove();
    },
    { once: true }
  );
  tester.src = url;
}

function openImagePreview(src: string, caption?: string): void {
  requiredPreviewOverlay.classList.add("is-visible");
  requiredPreviewOverlay.hidden = false;
  requiredPreviewImage.src = src;
  requiredPreviewCaption.textContent = caption ?? src;
  resetPreviewState();
  document.body.style.overflow = "hidden";
}

function closeImagePreview(): void {
  if (!requiredPreviewOverlay.classList.contains("is-visible")) {
    return;
  }
  endImageDrag();
  requiredPreviewOverlay.classList.remove("is-visible");
  requiredPreviewOverlay.hidden = true;
  requiredPreviewImage.src = "";
  requiredPreviewCaption.textContent = "";
  resetPreviewState();
  document.body.style.overflow = "";
}

function resetPreviewState(): void {
  previewState.scale = 1;
  previewState.rotation = 0;
  previewState.baseScale = 1;
  previewState.translateX = 0;
  previewState.translateY = 0;
  applyPreviewTransform();
  updateZoomIndicator();
}

function applyPreviewTransform(): void {
  const relativeScale = previewState.scale / (previewState.baseScale || 1);
  requiredPreviewImage.style.transform = `translate(${previewState.translateX}px, ${previewState.translateY}px) rotate(${previewState.rotation}deg) scale(${relativeScale})`;
}

function initializePreviewScale(): void {
  if (!requiredPreviewOverlay.classList.contains("is-visible")) {
    return;
  }
  endImageDrag();

  const naturalWidth = requiredPreviewImage.naturalWidth;
  const naturalHeight = requiredPreviewImage.naturalHeight;
  const wrapperRect = requiredPreviewWrapper.getBoundingClientRect();

  if (!naturalWidth || !naturalHeight || !wrapperRect.width || !wrapperRect.height) {
    previewState.baseScale = 1;
  } else {
    const widthRatio = wrapperRect.width / naturalWidth;
    const heightRatio = wrapperRect.height / naturalHeight;
    const fitScale = Math.min(widthRatio, heightRatio);
    previewState.baseScale = Math.min(1, fitScale);
  }

  previewState.scale = previewState.baseScale;
  previewState.rotation = 0;
  previewState.translateX = 0;
  previewState.translateY = 0;
  applyPreviewTransform();
  updateZoomIndicator();
}

function clampScale(value: number): number {
  const dynamicMin = Math.min(MIN_SCALE, previewState.baseScale);
  return Math.min(MAX_SCALE, Math.max(dynamicMin, value));
}

function setScale(value: number): void {
  previewState.scale = clampScale(value);
  applyPreviewTransform();
  updateZoomIndicator();
}

function adjustPreview(action: string): void {
  switch (action) {
    case "zoom-in":
      setScale(previewState.scale + 0.25);
      return;
    case "zoom-out":
      setScale(previewState.scale - 0.25);
      return;
    case "zoom-100":
      setScale(1);
      return;
    case "rotate-left":
      previewState.rotation -= 90;
      break;
    case "rotate-right":
      previewState.rotation += 90;
      break;
    case "reset":
      previewState.rotation = 0;
      previewState.translateX = 0;
      previewState.translateY = 0;
      setScale(previewState.baseScale);
      return;
    default:
      return;
  }
  applyPreviewTransform();
}

function updateZoomIndicator(): void {
  const percent = Math.round(previewState.scale * 100);
  requiredZoomIndicator.textContent = `${percent}%`;
}

function handlePreviewWheel(event: WheelEvent): void {
  if (!requiredPreviewOverlay.classList.contains("is-visible")) {
    return;
  }
  event.preventDefault();
  const direction = Math.sign(event.deltaY || 0);
  if (direction === 0) {
    return;
  }
  const base = event.ctrlKey ? 0.05 : 0.12;
  const dynamicStep = base * (1 + previewState.scale * 0.6);
  const nextScale = previewState.scale + (direction > 0 ? -dynamicStep : dynamicStep);
  setScale(nextScale);
}

function startImageDrag(event: PointerEvent): void {
  if (!requiredPreviewOverlay.classList.contains("is-visible")) {
    return;
  }
  if (event.button !== 0 && event.pointerType !== "touch") {
    return;
  }
  isDraggingImage = true;
  dragPointerId = event.pointerId;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragOriginX = previewState.translateX;
  dragOriginY = previewState.translateY;
  requiredPreviewWrapper.classList.add("is-dragging");
  requiredPreviewWrapper.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function moveImageDrag(event: PointerEvent): void {
  if (!isDraggingImage || event.pointerId !== dragPointerId) {
    return;
  }
  const dx = event.clientX - dragStartX;
  const dy = event.clientY - dragStartY;
  previewState.translateX = dragOriginX + dx;
  previewState.translateY = dragOriginY + dy;
  applyPreviewTransform();
}

function endImageDrag(event?: PointerEvent): void {
  if (!isDraggingImage) {
    return;
  }
  if (event && dragPointerId !== null && event.pointerId === dragPointerId) {
    try {
      requiredPreviewWrapper.releasePointerCapture(event.pointerId);
    } catch (err) {
      // ignore
    }
  }
  dragPointerId = null;
  isDraggingImage = false;
  requiredPreviewWrapper.classList.remove("is-dragging");
}

function highlightDropZone(highlight: boolean): void {
  requiredDropZone.classList.toggle("dragover", highlight);
}

function handleDrop(event: DragEvent): void {
  event.preventDefault();
  highlightDropZone(false);
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    loadFile(file);
    requiredFileInput.value = "";
  }
}

function setupDragAndDrop(): void {
  (["dragenter", "dragover"] as const).forEach((eventName) => {
    requiredDropZone.addEventListener(eventName, (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      highlightDropZone(true);
    });
  });

  (["dragleave", "drop"] as const).forEach((eventName) => {
    requiredDropZone.addEventListener(eventName, (event: DragEvent) => {
      event.preventDefault();
      const relatedTarget = event.relatedTarget;
      if (relatedTarget instanceof Node && requiredDropZone.contains(relatedTarget)) {
        return;
      }
      highlightDropZone(false);
    });
  });

  requiredDropZone.addEventListener("drop", handleDrop);
  requiredDropZone.addEventListener("click", () => requiredFileInput.click());
}

requiredFileInput.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  loadFile(file);
});

requiredSampleBtn.addEventListener("click", () => {
  handleCSVText(SAMPLE_CSV, "示例 CSV", null);
  updateHistoryState(null, undefined, true);
});

requiredServerRefreshBtn.addEventListener("click", () => {
  void loadServerDirectory(currentServerPath, { silent: true });
});

requiredPreviewToolbar.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(".preview-action");
  if (!target) {
    return;
  }
  const { action } = target.dataset;
  if (action) {
    adjustPreview(action);
  }
});

requiredPreviewWrapper.addEventListener("pointerdown", startImageDrag);
requiredPreviewWrapper.addEventListener("pointermove", moveImageDrag);
requiredPreviewWrapper.addEventListener("pointerup", endImageDrag);
requiredPreviewWrapper.addEventListener("pointercancel", endImageDrag);
requiredPreviewWrapper.addEventListener("wheel", handlePreviewWheel, { passive: false });

requiredPreviewClose.addEventListener("click", closeImagePreview);
requiredPreviewOverlay.addEventListener("click", (event: MouseEvent) => {
  if (event.target === requiredPreviewOverlay) {
    closeImagePreview();
  }
});

document.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    closeImagePreview();
  }
});

requiredPreviewImage.addEventListener("load", initializePreviewScale);

window.addEventListener("resize", () => {
  if (requiredPreviewOverlay.classList.contains("is-visible")) {
    initializePreviewScale();
  }
});

requiredTableBackBtn.addEventListener("click", () => {
  navigateToExplorerRoot(true);
  showStatus("已返回服务器浏览");
});

window.addEventListener("popstate", (event) => {
  const state = (event.state as HistoryState | null) ?? { virtualPath: extractVirtualPathFromLocation() };
  const virtualPath = state?.virtualPath;
  if (!virtualPath) {
    hideTableSection();
    showStatus("已返回服务器浏览");
    return;
  }
  void loadServerCsv(toServerPath(virtualPath), {
    label: state?.label ?? deriveLabelFromVirtualPath(virtualPath),
    pushHistory: false,
    virtualPath,
  });
});

function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(SERVICE_WORKER_URL, { scope: APP_BASE_PATH })
      .catch((error) => {
        console.warn("Service worker registration failed:", error);
      });
  });
}

hideTableSection();
closeImagePreview();
setupDragAndDrop();
if (!INITIAL_VIRTUAL_PATH) {
  showStatus("等待选择 CSV 文件…");
}
registerServiceWorker();
void initServerExplorer(INITIAL_VIRTUAL_PATH);
