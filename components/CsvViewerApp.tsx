"use client";

/* eslint-disable @next/next/no-img-element */

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import CsvTable from "@/components/CsvTable";
import type { CsvRow } from "@/lib/csv";
import { parseCsv } from "@/lib/csv";

const SERVER_ROOT_DIR = "server-data/";
const SAMPLE_CSV = `名称,描述,图片
url 链接图片,这是一个url链接嵌入的图片,https://images.unsplash.com/photo-1459257868276-5e65389e2722?auto=format&fit=crop&w=400&q=60
服务器本地图片,"这是一个服务器上的本地图片",nano_preprocess/12.8/full/0/output_0.png
s3 链接图片,这是一个s3链接嵌入的图片,s3://trash-in-picaa/nano-preprocess/12.8/full/0/output_0.png`;
const MIN_SCALE = 0.1;
const MAX_SCALE = 6;
const SERVER_PUBLIC_PREFIX = "/server-data/";

interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

type StatusState = {
  message: string;
  isError: boolean;
};

type PreviewState = {
  isOpen: boolean;
  src: string;
  caption: string;
  scale: number;
  rotation: number;
  baseScale: number;
  translateX: number;
  translateY: number;
};

type TableSource = "server" | "local" | null;

const INITIAL_PREVIEW_STATE: PreviewState = {
  isOpen: false,
  src: "",
  caption: "",
  scale: 1,
  rotation: 0,
  baseScale: 1,
  translateX: 0,
  translateY: 0,
};

export default function CsvViewerApp({
  initialVirtualPath,
  initialServerPath = null,
}: {
  initialVirtualPath: string | null;
  initialServerPath?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const normalizedVirtualPath = pathname === "/" ? null : decodeURIComponent(pathname);
  const initialServerDir = useMemo(
    () => normalizeDirectoryPath(initialServerPath ?? SERVER_ROOT_DIR),
    [initialServerPath]
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewWrapperRef = useRef<HTMLDivElement | null>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const dragStateRef = useRef({
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });
  const previewStateRef = useRef<PreviewState>(INITIAL_PREVIEW_STATE);

  const [status, setStatus] = useState<StatusState>({
    message: initialVirtualPath ? "正在加载 CSV …" : "等待选择 CSV 文件…",
    isError: false,
  });
  const showStatus = useCallback((message: string, isError = false) => {
    setStatus({ message, isError });
  }, []);

  const [serverEntries, setServerEntries] = useState<DirectoryEntry[]>([]);
  const [serverLoading, setServerLoading] = useState(true);
  const [serverPath, setServerPath] = useState(initialServerDir);
  const [tableRows, setTableRows] = useState<CsvRow[] | null>(null);
  const [tableLabel, setTableLabel] = useState("CSV 预览");
  const [tableVirtualPath, setTableVirtualPath] = useState<string | null>(initialVirtualPath);
  const [tableLoading, setTableLoading] = useState(Boolean(initialVirtualPath));
  const [tableSource, setTableSource] = useState<TableSource>(initialVirtualPath ? "server" : null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<boolean[]>([]);
  const [columnOrder, setColumnOrder] = useState<number[]>([]);
  const [tableLayoutVersion, setTableLayoutVersion] = useState(0);
  const [dropActive, setDropActive] = useState(false);
  const [preview, setPreview] = useState<PreviewState>(INITIAL_PREVIEW_STATE);
  const [isDraggingPreview, setIsDraggingPreview] = useState(false);
  const columnControlDragRef = useRef<number | null>(null);
  const [columnControlDragOver, setColumnControlDragOver] = useState<number | null>(null);
  const [columnControlDragging, setColumnControlDragging] = useState<number | null>(null);

  useEffect(() => {
    previewStateRef.current = preview;
  }, [preview]);

  useEffect(() => {
    document.body.classList.remove("app-initializing");
  }, []);

  useEffect(() => {
    if (tableLoading || (tableRows && tableRows.length)) {
      document.body.classList.add("table-view-active");
    } else {
      document.body.classList.remove("table-view-active");
    }

    return () => {
      document.body.classList.remove("table-view-active");
    };
  }, [tableLoading, tableRows]);

  useEffect(() => {
    if (tableVirtualPath && typeof window !== "undefined") {
      setShareUrl(new URL(tableVirtualPath, window.location.origin).toString());
    } else if (!tableVirtualPath) {
      setShareUrl(null);
    }
  }, [tableVirtualPath]);

  const updateExplorerUrl = useCallback((normalizedPath: string) => {
    if (typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("dir", normalizedPath);
    url.pathname = "/";
    window.history.replaceState(null, "", url.toString());
  }, []);

  const loadServerDirectory = useCallback(
    async (path: string, { silent = false, skipUrl = false }: { silent?: boolean; skipUrl?: boolean } = {}) => {
      const normalized = normalizeDirectoryPath(path);
      setServerLoading(true);
      try {
        const query = new URLSearchParams({ path: normalized }).toString();
        const response = await fetch(`/api/server-data?${query}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`无法访问 ${normalized}`);
        }
        const data = (await response.json()) as { entries: DirectoryEntry[] };
        setServerEntries(data.entries ?? []);
        setServerPath(normalized);
        if (!skipUrl) {
          updateExplorerUrl(normalized);
        }
        if (!silent) {
          showStatus(`已打开 ${normalized}`);
        }
      } catch (error) {
        console.error(error);
        showStatus("无法访问服务器目录。", true);
      } finally {
        setServerLoading(false);
      }
    },
    [showStatus, updateExplorerUrl]
  );

  useEffect(() => {
    void loadServerDirectory(initialServerDir, { silent: true, skipUrl: true });
  }, [initialServerDir, loadServerDirectory]);

  const handleCsvText = useCallback(
    (
      text: string,
      label?: string,
      virtualPath?: string | null,
      source: TableSource = "local",
      options: { preserveLayout?: boolean } = {}
    ) => {
      const { preserveLayout = false } = options;
      try {
        const rows = parseCsv(text);
        if (!rows.length || rows.every((row) => row.every((cell) => !cell.trim()))) {
          setTableRows(null);
          setColumnVisibility([]);
          setColumnOrder([]);
          setTableLoading(false);
          setTableSource(null);
          showStatus("CSV 内容为空，无法展示。");
          return;
        }
        const maxColumns = getMaxColumnCount(rows);
        setTableRows(rows);
        setTableLabel(label ?? "CSV 预览");
        setTableVirtualPath(virtualPath ?? null);
        setTableSource(source);
        if (preserveLayout) {
          setColumnVisibility((prev) => {
            if (!prev.length) {
              return Array.from({ length: maxColumns }, () => true);
            }
            if (prev.length === maxColumns) {
              return prev;
            }
            if (prev.length > maxColumns) {
              return prev.slice(0, maxColumns);
            }
            return [...prev, ...Array.from({ length: maxColumns - prev.length }, () => true)];
          });
          setColumnOrder((prev) => {
            if (!prev.length) {
              return Array.from({ length: maxColumns }, (_, index) => index);
            }
            const normalized = prev.filter((index) => index >= 0 && index < maxColumns);
            const existing = new Set(normalized);
            const missing: number[] = [];
            for (let index = 0; index < maxColumns; index += 1) {
              if (!existing.has(index)) {
                missing.push(index);
              }
            }
            const next = [...normalized, ...missing];
            if (next.length === prev.length && next.every((value, index) => value === prev[index])) {
              return prev;
            }
            return next;
          });
        } else {
          setColumnVisibility(Array.from({ length: maxColumns }, () => true));
          setColumnOrder(Array.from({ length: maxColumns }, (_, index) => index));
          setTableLayoutVersion((prev) => prev + 1);
        }
        setTableLoading(false);
        showStatus(`成功载入 ${rows.length} 行数据。`);
      } catch (error) {
        console.error(error);
        setTableRows(null);
        setColumnVisibility([]);
        setColumnOrder([]);
        setTableLoading(false);
        setTableSource(null);
        showStatus("解析 CSV 失败，请检查文件格式。", true);
      }
    },
    [showStatus]
  );

  const loadServerCsv = useCallback(
    async (
      virtualPath: string,
      { suppressStatus = false, preserveLayout = false }: { suppressStatus?: boolean; preserveLayout?: boolean } = {}
    ) => {
      const label = deriveLabelFromVirtualPath(virtualPath);
      setTableLabel(label);
      setTableVirtualPath(virtualPath);
      setTableLoading(true);
      if (!suppressStatus) {
        showStatus(`正在从服务器读取 ${label} ...`);
      }
      try {
        const serverPath = toServerPath(virtualPath);
        const response = await fetch(`/${serverPath}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`服务器返回 ${response.status}`);
        }
        const text = await response.text();
        handleCsvText(text, label, virtualPath, "server", { preserveLayout });
        if (!suppressStatus) {
          showStatus(`已加载 ${label}。`);
        }
      } catch (error) {
        console.error(error);
        setTableLoading(false);
        setTableSource(null);
        showStatus("加载服务器 CSV 时遇到问题，请稍后重试。", true);
      }
    },
    [handleCsvText, showStatus]
  );

  const lastVirtualRef = useRef<string | null>(null);
  const suppressNullPathRef = useRef(Boolean(initialVirtualPath));

  const handleFile = useCallback(
    (file?: File | null) => {
      if (!file) return;
      showStatus(`正在读取 ${file.name} ...`);
      setTableLoading(true);
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === "string") {
          handleCsvText(result, file.name, null, "local");
          router.replace("/");
        } else {
          setTableLoading(false);
          showStatus("文件内容不是文本。", true);
        }
      };
      reader.onerror = () => {
        setTableLoading(false);
        showStatus("读取文件时出现问题。", true);
      };
      reader.readAsText(file, "utf-8");
    },
    [handleCsvText, router, showStatus]
  );

  const handleSample = useCallback(() => {
    handleCsvText(SAMPLE_CSV, "示例 CSV", null, "server");
    router.replace("/");
  }, [handleCsvText, router]);

  const handleDownloadSample = useCallback(() => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "sample.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, []);

  const openServerCsv = useCallback(
    (virtualPath: string) => {
      suppressNullPathRef.current = true;
      router.push(virtualPath);
    },
    [router]
  );

  useEffect(() => {
    if (normalizedVirtualPath === lastVirtualRef.current) {
      if (normalizedVirtualPath) {
        suppressNullPathRef.current = false;
      }
      return;
    }
    if (!normalizedVirtualPath) {
      if (suppressNullPathRef.current) {
        return;
      }
      lastVirtualRef.current = null;
      if (tableSource === "server") {
        setTableRows(null);
        setColumnVisibility([]);
        setColumnOrder([]);
        setTableLabel("CSV 预览");
        setTableVirtualPath(null);
        setTableLoading(false);
        setTableSource(null);
        showStatus("已返回服务器浏览");
      }
      return;
    }
    suppressNullPathRef.current = false;
    lastVirtualRef.current = normalizedVirtualPath;
    void loadServerCsv(normalizedVirtualPath);
  }, [loadServerCsv, normalizedVirtualPath, showStatus, tableSource]);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDropActive(false);
      const file = event.dataTransfer?.files?.[0];
      handleFile(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [handleFile]
  );

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    setDropActive(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const related = event.relatedTarget as Node | null;
    if (related && event.currentTarget.contains(related)) {
      return;
    }
    setDropActive(false);
  }, []);

  const handleBackToExplorer = useCallback(() => {
    setTableRows(null);
    setColumnVisibility([]);
    setColumnOrder([]);
    setTableLabel("CSV 预览");
    setTableVirtualPath(null);
    setTableSource(null);
    setTableLoading(false);
    showStatus("已返回服务器浏览");
    const search = new URLSearchParams({ dir: serverPath }).toString();
    router.replace(`/?${search}`);
  }, [router, serverPath, showStatus]);

  const sortedEntries = useMemo(() => sortDirectoryEntries(serverEntries), [serverEntries]);
  const filteredEntries = useMemo(
    () => sortedEntries.filter((entry) => entry.isDirectory || isCsvFile(entry.path)),
    [sortedEntries]
  );
  const breadcrumbParts = useMemo(() => buildBreadcrumb(serverPath), [serverPath]);

  const columnLabelMap = useMemo(() => {
    if (!columnVisibility.length) {
      return new Map<number, string>();
    }
    const header = tableRows?.[0] ?? [];
    const map = new Map<number, string>();
    columnVisibility.forEach((_, index) => {
      const label = header[index]?.trim();
      map.set(index, label || `列 ${index + 1}`);
    });
    return map;
  }, [columnVisibility, tableRows]);

  const visibleColumnCount = useMemo(
    () => columnVisibility.reduce((count, visible) => count + (visible ? 1 : 0), 0),
    [columnVisibility]
  );

  const columnDisplayOrder = useMemo(() => {
    if (columnOrder.length === columnVisibility.length && columnOrder.length) {
      return columnOrder;
    }
    return columnVisibility.map((_, index) => index);
  }, [columnOrder, columnVisibility]);

  const toggleColumnVisibility = useCallback(
    (index: number) => {
      setColumnVisibility((prev) => {
        if (index < 0 || index >= prev.length) {
          return prev;
        }
        const currentlyVisible = prev[index];
        if (currentlyVisible) {
          const visibleCount = prev.reduce((count, flag) => count + (flag ? 1 : 0), 0);
          if (visibleCount <= 1) {
            return prev;
          }
        }
        const next = [...prev];
        next[index] = !next[index];
        return next;
      });
    },
    []
  );

  const handleColumnControlDragStart = useCallback(
    (displayIndex: number, event: React.DragEvent<HTMLLabelElement>) => {
      columnControlDragRef.current = displayIndex;
      setColumnControlDragging(displayIndex);
      setColumnControlDragOver(null);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(displayIndex));
      }
    },
    []
  );

  const handleColumnControlDragOver = useCallback(
    (displayIndex: number, event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      if (columnControlDragRef.current === null || columnControlDragRef.current === displayIndex) {
        return;
      }
      setColumnControlDragOver(displayIndex);
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    },
    []
  );

  const handleColumnControlDrop = useCallback(
    (displayIndex: number, event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      const fromIndex = columnControlDragRef.current;
      if (fromIndex === null || fromIndex === displayIndex) {
        setColumnControlDragOver(null);
        setColumnControlDragging(null);
        columnControlDragRef.current = null;
        return;
      }
      const nextOrder = reorderArray(columnDisplayOrder, fromIndex, displayIndex);
      setColumnOrder(nextOrder);
      setTableLayoutVersion((prev) => prev + 1);
      setColumnControlDragOver(null);
      setColumnControlDragging(null);
      columnControlDragRef.current = null;
    },
    [columnDisplayOrder]
  );

  const handleColumnControlDragEnd = useCallback(() => {
    columnControlDragRef.current = null;
    setColumnControlDragOver(null);
    setColumnControlDragging(null);
  }, []);

  const hiddenColumns = useMemo(() => {
    if (!columnVisibility.length) {
      return undefined;
    }
    const hidden = new Set<number>();
    columnVisibility.forEach((visible, index) => {
      if (!visible) {
        hidden.add(index);
      }
    });
    return hidden.size ? hidden : undefined;
  }, [columnVisibility]);

  const handleColumnReorder = useCallback((nextOrder: number[]) => {
    setColumnOrder(nextOrder);
  }, []);

  const resolveServerAssetUrl = useCallback((raw: string) => resolveServerAssetPath(raw), []);
  const activeAssetResolver = resolveServerAssetUrl;

  const handleRefreshTableData = useCallback(() => {
    if (tableSource !== "server" || !tableVirtualPath) {
      return;
    }
    void loadServerCsv(tableVirtualPath, { preserveLayout: true });
  }, [loadServerCsv, tableSource, tableVirtualPath]);

  const openPreview = useCallback((src: string, caption?: string) => {
    setPreview({
      ...INITIAL_PREVIEW_STATE,
      isOpen: true,
      src,
      caption: caption ?? src,
    });
  }, []);

  const closePreview = useCallback(() => {
    setPreview(INITIAL_PREVIEW_STATE);
    setIsDraggingPreview(false);
  }, []);

  useEffect(() => {
    if (!preview.isOpen) {
      return;
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePreview();
      }
    };
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("keydown", keydown);
      document.body.style.overflow = originalOverflow;
    };
  }, [closePreview, preview.isOpen]);

  const initializePreviewScale = useCallback(() => {
    if (!previewStateRef.current.isOpen) {
      return;
    }
    const wrapper = previewWrapperRef.current;
    const image = previewImageRef.current;
    if (!wrapper || !image) {
      return;
    }
    const naturalWidth = image.naturalWidth || image.clientWidth;
    const naturalHeight = image.naturalHeight || image.clientHeight;
    const { width, height } = wrapper.getBoundingClientRect();
    if (!naturalWidth || !naturalHeight || !width || !height) {
      setPreview((prev) => ({ ...prev, baseScale: 1, scale: 1, rotation: 0, translateX: 0, translateY: 0 }));
      return;
    }
    const widthRatio = width / naturalWidth;
    const heightRatio = height / naturalHeight;
    const fitScale = Math.min(widthRatio, heightRatio);
    const baseScale = Math.min(1, fitScale);
    setPreview((prev) => ({
      ...prev,
      baseScale,
      scale: baseScale,
      rotation: 0,
      translateX: 0,
      translateY: 0,
    }));
  }, []);

  useEffect(() => {
    if (!preview.isOpen) {
      return;
    }
    const handleResize = () => initializePreviewScale();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [initializePreviewScale, preview.isOpen]);

  const clampScaleValue = useCallback((value: number) => {
    const base = previewStateRef.current.baseScale || 1;
    const minScale = Math.min(MIN_SCALE, base);
    return Math.min(MAX_SCALE, Math.max(minScale, value));
  }, []);

  const adjustPreview = useCallback(
    (action: string) => {
      setPreview((prev) => {
        switch (action) {
          case "zoom-in":
            return { ...prev, scale: clampScaleValue(prev.scale + 0.25) };
          case "zoom-out":
            return { ...prev, scale: clampScaleValue(prev.scale - 0.25) };
          case "zoom-100":
            return { ...prev, scale: 1 };
          case "rotate-left":
            return { ...prev, rotation: prev.rotation - 90 };
          case "rotate-right":
            return { ...prev, rotation: prev.rotation + 90 };
          case "reset":
            return {
              ...prev,
              rotation: 0,
              translateX: 0,
              translateY: 0,
              scale: prev.baseScale,
            };
          default:
            return prev;
        }
      });
    },
    [clampScaleValue]
  );

  const handlePreviewWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!previewStateRef.current.isOpen) {
        return;
      }
      event.preventDefault();
      const direction = Math.sign(event.deltaY || 0);
      if (direction === 0) {
        return;
      }
      const baseStep = event.ctrlKey ? 0.05 : 0.12;
      const dynamicStep = baseStep * (1 + previewStateRef.current.scale * 0.6);
      const next = previewStateRef.current.scale + (direction > 0 ? -dynamicStep : dynamicStep);
      setPreview((prev) => ({ ...prev, scale: clampScaleValue(next) }));
    },
    [clampScaleValue]
  );

  const startImageDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!previewStateRef.current.isOpen) {
      return;
    }
    if (event.button !== 0 && event.pointerType !== "touch") {
      return;
    }
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: previewStateRef.current.translateX,
      originY: previewStateRef.current.translateY,
    };
    setIsDraggingPreview(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, []);

  const moveImageDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - dragStateRef.current.startX;
    const dy = event.clientY - dragStateRef.current.startY;
    setPreview((prev) => ({
      ...prev,
      translateX: dragStateRef.current.originX + dx,
      translateY: dragStateRef.current.originY + dy,
    }));
  }, []);

  const endImageDrag = useCallback((event?: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current.pointerId && event && event.pointerId === dragStateRef.current.pointerId) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch (error) {
        // ignore
      }
    }
    dragStateRef.current.pointerId = null;
    setIsDraggingPreview(false);
  }, []);

  const showTableSection = tableLoading || Boolean(tableRows && tableRows.length);

  const statusColor = status.isError ? "#d93025" : "#4d5560";
  const relativeScale = preview.baseScale ? preview.scale / preview.baseScale : preview.scale;
  const zoomPercent = Math.round(preview.scale * 100);

  return (
    <main className="container">
      <header>
        <h1>CSV Viewer</h1>
        <p>上传或拖拽 CSV，或直接浏览 server-data 目录，自动识别图片与链接。</p>
      </header>

      <section className="controls">
        <label className="file-input">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
          <span>选择 CSV 文件</span>
        </label>
        <button type="button" onClick={handleSample}>
          载入示例
        </button>
        <button type="button" onClick={handleDownloadSample}>
          下载示例
        </button>
      </section>

      <section
        className={`drop-zone${dropActive ? " dragover" : ""}`}
        onDragEnter={handleDragEnter}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <p>将 CSV 拖拽到这里，或点击上方按钮选择文件</p>
      </section>

      <section className="status" aria-live="polite" style={{ color: statusColor }}>
        {status.message}
      </section>

      <section className="server-explorer" aria-labelledby="serverExplorerTitle">
        <div className="server-explorer-header">
          <h2 id="serverExplorerTitle">服务器 CSV</h2>
          <button type="button" onClick={() => loadServerDirectory(serverPath, { silent: true })}>
            刷新
          </button>
        </div>
        <p className="server-explorer-desc">像文件资源管理器一样浏览 server-data 目录，点击 CSV 直接加载。</p>
        <nav className="server-breadcrumb" aria-label="服务器路径">
          <button
            type="button"
            className={!breadcrumbParts.length ? "active" : ""}
            onClick={() => loadServerDirectory(SERVER_ROOT_DIR)}
            disabled={!breadcrumbParts.length}
          >
            server-data
          </button>
          {breadcrumbParts.map((part) => (
            <button
              key={part.path}
              type="button"
              className={part.isCurrent ? "active" : ""}
              onClick={() => loadServerDirectory(part.path)}
              disabled={part.isCurrent}
            >
              {part.label}
            </button>
          ))}
        </nav>
        <div className="server-explorer-list" aria-live="polite">
          {serverLoading ? (
            <div className="server-explorer-empty">正在加载目录…</div>
          ) : !filteredEntries.length ? (
            <div className="server-explorer-empty">该目录为空。</div>
          ) : (
            <>
              {serverPath !== normalizeDirectoryPath(SERVER_ROOT_DIR) ? (
                <button
                  type="button"
                  className="server-entry"
                  onClick={() => {
                    const parent = getParentDirectory(serverPath) ?? SERVER_ROOT_DIR;
                    void loadServerDirectory(parent);
                  }}
                >
                  <span className="entry-type">返回</span>
                  <h3>上一级目录</h3>
                </button>
              ) : null}
              {filteredEntries.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  className="server-entry"
                  onClick={() => {
                    if (entry.isDirectory) {
                      void loadServerDirectory(entry.path);
                    } else {
                      const virtualPath = toVirtualPath(entry.path);
                      openServerCsv(virtualPath);
                    }
                  }}
                >
                  <span className="entry-type">{entry.isDirectory ? "目录" : "CSV"}</span>
                  <h3>{entry.name}</h3>
                </button>
              ))}
            </>
          )}
        </div>
      </section>

      <section className="table-section" hidden={!showTableSection}>
        <div className="table-view-header">
          <button type="button" onClick={handleBackToExplorer} aria-label="返回服务器浏览">
            ← 返回
          </button>
          <div className="table-view-meta">
            <strong>{tableLabel}</strong>
            {shareUrl ? (
              <a className="table-file-link" href={shareUrl} target="_blank" rel="noopener noreferrer">
                {shareUrl}
              </a>
            ) : null}
          </div>
          <button
            type="button"
            className="table-reset-btn"
            onClick={handleRefreshTableData}
            disabled={tableSource !== "server" || !tableVirtualPath}
          >
            刷新
          </button>
        </div>
        <div className="table-section-content">
          {tableLoading ? (
            <div className="table-wrapper">
              <div className="table-loading-cell">正在加载 CSV …</div>
            </div>
          ) : tableRows ? (
            <>
              {columnVisibility.length ? (
                <div className="table-column-controls">
                  <span>列显示：</span>
                  <div className="table-column-control-list" role="group" aria-label="列显示控制">
                    {columnDisplayOrder.map((columnIndex, displayIndex) => {
                      const visible = columnVisibility[columnIndex];
                      const label = columnLabelMap.get(columnIndex) ?? `列 ${columnIndex + 1}`;
                      const isDragging = columnControlDragging === displayIndex;
                      const isDragOver = columnControlDragOver === displayIndex;
                      return (
                        <label
                          key={`column-toggle-${columnIndex}`}
                          className={`column-control-item${isDragging ? " is-dragging" : ""}${
                            isDragOver ? " is-drag-over" : ""
                          }`}
                          draggable
                          onDragStart={(event) => handleColumnControlDragStart(displayIndex, event)}
                          onDragOver={(event) => handleColumnControlDragOver(displayIndex, event)}
                          onDrop={(event) => handleColumnControlDrop(displayIndex, event)}
                          onDragEnd={handleColumnControlDragEnd}
                          onDragLeave={() => setColumnControlDragOver(null)}
                        >
                          <input
                            type="checkbox"
                            checked={visible}
                            disabled={visible && visibleColumnCount <= 1}
                            onChange={() => toggleColumnVisibility(columnIndex)}
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="table-wrapper">
                <CsvTable
                  key={tableLayoutVersion}
                  rows={tableRows}
                  onImageClick={openPreview}
                  resolveAssetUrl={activeAssetResolver}
                  hiddenColumns={hiddenColumns}
                  columnOrder={columnDisplayOrder}
                  onReorderColumns={handleColumnReorder}
                />
              </div>
            </>
          ) : null}
        </div>
      </section>

      <section
        className={`preview-overlay${preview.isOpen ? " is-visible" : ""}`}
        aria-hidden={!preview.isOpen}
        aria-label="图片预览"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closePreview();
          }
        }}
        hidden={!preview.isOpen}
      >
        <div className="preview-dialog">
          <button type="button" className="preview-close" onClick={closePreview} aria-label="关闭预览">
            ×
          </button>
          <div
            ref={previewWrapperRef}
            className={`preview-image-wrapper${isDraggingPreview ? " is-dragging" : ""}`}
            onPointerDown={startImageDrag}
            onPointerMove={moveImageDrag}
            onPointerUp={endImageDrag}
            onPointerCancel={endImageDrag}
            onWheel={handlePreviewWheel}
          >
            {preview.isOpen ? (
              <img
                ref={previewImageRef}
                src={preview.src}
                alt="CSV 图片预览"
                onLoad={initializePreviewScale}
                draggable={false}
                style={{
                  transform: `translate(${preview.translateX}px, ${preview.translateY}px) rotate(${preview.rotation}deg) scale(${relativeScale})`,
                }}
              />
            ) : null}
          </div>
          <div className="preview-toolbar" role="toolbar" aria-label="图片操作">
            <button type="button" className="preview-action" data-action="rotate-left" onClick={() => adjustPreview("rotate-left")}>
              ↺
            </button>
            <button type="button" className="preview-action" data-action="rotate-right" onClick={() => adjustPreview("rotate-right")}>
              ↻
            </button>
            <button type="button" className="preview-action" data-action="zoom-in" onClick={() => adjustPreview("zoom-in")}>
              +
            </button>
            <span className="preview-zoom" aria-live="polite">
              {zoomPercent}%
            </span>
            <button type="button" className="preview-action" data-action="zoom-out" onClick={() => adjustPreview("zoom-out")}>
              −
            </button>
            <button type="button" className="preview-action" data-action="reset" onClick={() => adjustPreview("reset")}>
              ⟳
            </button>
          </div>
          <p>{preview.caption}</p>
        </div>
      </section>
    </main>
  );
}

function normalizeDirectoryPath(path: string): string {
  let normalized = path.trim();
  if (!normalized) {
    normalized = SERVER_ROOT_DIR;
  }
  normalized = normalized.replace(/^\.\/?/, "");
  normalized = normalized.replace(/^\//, "");
  if (!normalized.startsWith(SERVER_ROOT_DIR)) {
    normalized = `${SERVER_ROOT_DIR}${normalized}`;
  }
  if (!normalized.endsWith("/")) {
    normalized += "/";
  }
  return normalized;
}

function sortDirectoryEntries(entries: DirectoryEntry[]): DirectoryEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.path.localeCompare(b.path);
  });
}

function buildBreadcrumb(path: string): Array<{ label: string; path: string; isCurrent: boolean }> {
  const normalized = normalizeDirectoryPath(path);
  const remainder = normalized.replace(SERVER_ROOT_DIR, "");
  if (!remainder) {
    return [];
  }
  const parts = remainder.split("/").filter(Boolean);
  const breadcrumbs: Array<{ label: string; path: string; isCurrent: boolean }> = [];
  let accumulated = SERVER_ROOT_DIR;
  parts.forEach((part, index) => {
    accumulated = `${accumulated}${part}/`;
    breadcrumbs.push({ label: part, path: accumulated, isCurrent: index === parts.length - 1 });
  });
  return breadcrumbs;
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

function deriveLabelFromVirtualPath(virtualPath: string): string {
  const segments = virtualPath.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "CSV 预览";
}

function getMaxColumnCount(rows: CsvRow[]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}

function reorderArray<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function toServerPath(virtualPath: string): string {
  const trimmed = virtualPath.replace(/^\/+/, "");
  return `${SERVER_ROOT_DIR}${trimmed}`;
}

function toVirtualPath(serverPath: string): string {
  const trimmed = serverPath.replace(/^server-data\/?/, "");
  return `/${trimmed.replace(/^\/+/, "")}`;
}

function isCsvFile(path: string): boolean {
  return path.toLowerCase().endsWith(".csv");
}

function resolveServerAssetPath(value: string): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("s3://")) {
    return `/api/s3-presign?uri=${encodeURIComponent(trimmed)}`;
  }
  if (isAbsoluteLikeUrl(trimmed) || trimmed.startsWith("data:")) {
    const s3Uri = toS3UriFromHttps(trimmed);
    if (s3Uri) {
      return `/api/s3-presign?uri=${encodeURIComponent(s3Uri)}`;
    }
    return trimmed;
  }
  if (trimmed.startsWith(SERVER_PUBLIC_PREFIX)) {
    return normalizeSlashes(trimmed);
  }
  if (trimmed.startsWith("/")) {
    return normalizeSlashes(trimmed);
  }
  const withoutCurrentDir = trimmed.replace(/^\.\/+/, "");
  const sanitized = stripParentSegments(withoutCurrentDir);
  return normalizeSlashes(`${SERVER_PUBLIC_PREFIX}${sanitized}`);
}

function normalizeSlashes(value: string): string {
  return value.replace(/\/+/g, "/");
}

function stripParentSegments(value: string): string {
  return value.replace(/\.\.(\/|\\)/g, "");
}

function isAbsoluteLikeUrl(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value) || value.startsWith("//");
}

function toS3UriFromHttps(value: string): string | null {
  if (value.startsWith("data:")) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/^\/+/, "");

  // virtual host style: bucket.s3.amazonaws.com or bucket.s3.<region>.amazonaws.com
  const virtualHostMatch =
    host.match(/^(.+)\.s3[.-][a-z0-9-]+\.amazonaws\.com$/i) || host.match(/^(.+)\.s3\.amazonaws\.com$/i);
  if (virtualHostMatch) {
    const bucket = virtualHostMatch[1];
    if (bucket && path) {
      return `s3://${bucket}/${path}`;
    }
    return null;
  }

  // path style: s3.amazonaws.com/bucket/key or s3.<region>.amazonaws.com/bucket/key
  const pathStyleMatch = host === "s3.amazonaws.com" || /^s3[.-][a-z0-9-]+\.amazonaws\.com$/i.test(host);
  if (pathStyleMatch) {
    const [bucket, ...rest] = path.split("/");
    const key = rest.join("/");
    if (bucket && key) {
      return `s3://${bucket}/${key}`;
    }
  }

  return null;
}
