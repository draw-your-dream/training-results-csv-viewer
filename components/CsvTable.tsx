"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CsvRow } from "@/lib/csv";

const MIN_COLUMN_WIDTH = 48;

type CsvTableProps = {
  rows: CsvRow[];
  onImageClick: (src: string, caption?: string) => void;
  resolveAssetUrl?: (value: string) => string | null;
  hiddenColumns?: Set<number>;
  columnOrder?: number[];
  onReorderColumns?: (nextOrder: number[]) => void;
};

export default function CsvTable({
  rows,
  onImageClick,
  resolveAssetUrl,
  hiddenColumns,
  columnOrder,
  onReorderColumns,
}: CsvTableProps) {
  const hasRows = rows.length > 0;
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({});
  const headerRefs = useRef<Array<HTMLTableCellElement | null>>([]);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  const resizeStateRef = useRef<{
    index: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const dragColumnRef = useRef<number | null>(null);

  const handleResizePointerDown = useCallback(
    (index: number, event: React.PointerEvent<HTMLSpanElement>) => {
      event.preventDefault();
      const cell = headerRefs.current[index];
      const cellWidth = columnWidths[index] ?? cell?.getBoundingClientRect().width ?? MIN_COLUMN_WIDTH;
      resizeStateRef.current = {
        index,
        startX: event.clientX,
        startWidth: cellWidth,
      };
      document.body.classList.add("is-resizing-column");
    },
    [columnWidths]
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!resizeStateRef.current) {
        return;
      }
      const { index, startX, startWidth } = resizeStateRef.current;
      const delta = event.clientX - startX;
      const nextWidth = Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + delta));
      setColumnWidths((prev) => {
        if (prev[index] === nextWidth) {
          return prev;
        }
        return { ...prev, [index]: nextWidth };
      });
    };

    const handlePointerUp = () => {
      if (!resizeStateRef.current) {
        return;
      }
      resizeStateRef.current = null;
      document.body.classList.remove("is-resizing-column");
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.classList.remove("is-resizing-column");
      resizeStateRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!hasRows) {
      return;
    }
    const tableEl = tableRef.current;
    if (!tableEl) {
      return;
    }
    const container = tableEl.parentElement ?? tableEl;
    const updateWidth = () => {
      setAvailableWidth(container.clientWidth || window.innerWidth);
    };
    updateWidth();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          setAvailableWidth(entry.contentRect.width);
        }
      });
      observer.observe(container);
    } else {
      window.addEventListener("resize", updateWidth);
    }

    return () => {
      if (observer) {
        observer.disconnect();
      } else {
        window.removeEventListener("resize", updateWidth);
      }
    };
  }, [hasRows]);

  const [headerRow, ...bodyRows] = hasRows ? rows : [];
  const maxColumns = hasRows ? Math.max(getMaxColumns(rows), 1) : 0;

  const hiddenColumnSet = hiddenColumns ?? null;

  const visibleColumnCount = useMemo(() => {
    if (!maxColumns) {
      return 0;
    }
    let count = 0;
    for (let index = 0; index < maxColumns; index += 1) {
      if (!hiddenColumnSet?.has(index)) {
        count += 1;
      }
    }
    return count;
  }, [hiddenColumnSet, maxColumns]);

  const defaultColumnWidth = useMemo(() => {
    if (!visibleColumnCount || !availableWidth) {
      return undefined;
    }
    const fillWidth = availableWidth / visibleColumnCount;
    return Math.min(320, Math.max(MIN_COLUMN_WIDTH, Math.floor(fillWidth)));
  }, [availableWidth, visibleColumnCount]);

  const getColumnStyle = useCallback(
    (index: number) => {
      if (hiddenColumnSet?.has(index)) {
        return undefined;
      }
      const width = columnWidths[index] ?? defaultColumnWidth;
      if (!width) {
        return undefined;
      }
      const px = `${width}px`;
      return { width: px, minWidth: px };
    },
    [columnWidths, defaultColumnWidth, hiddenColumnSet]
  );

  const orderedColumns = useMemo(() => {
    if (!maxColumns) {
      return [];
    }
    if (columnOrder && columnOrder.length === maxColumns) {
      const normalized = columnOrder.filter((index) => index >= 0 && index < maxColumns);
      if (normalized.length === maxColumns) {
        return normalized;
      }
    }
    return Array.from({ length: maxColumns }, (_, index) => index);
  }, [columnOrder, maxColumns]);

  const reorderColumns = useCallback(
    (targetColumn: number) => {
      if (!onReorderColumns) {
        return;
      }
      const sourceColumn = dragColumnRef.current;
      dragColumnRef.current = null;
      if (sourceColumn == null || sourceColumn === targetColumn) {
        return;
      }
      const fromIndex = orderedColumns.indexOf(sourceColumn);
      const toIndex = orderedColumns.indexOf(targetColumn);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
        return;
      }
      const nextOrder = [...orderedColumns];
      nextOrder.splice(fromIndex, 1);
      nextOrder.splice(toIndex, 0, sourceColumn);
      onReorderColumns(nextOrder);
    },
    [onReorderColumns, orderedColumns]
  );

  const handleHeaderDragStart = useCallback((columnIndex: number, event: React.DragEvent<HTMLTableCellElement>) => {
    dragColumnRef.current = columnIndex;
    event.dataTransfer?.setData("text/plain", columnIndex.toString());
    event.dataTransfer?.setDragImage?.(event.currentTarget, 0, 0);
  }, []);

  const handleHeaderDragOver = useCallback((event: React.DragEvent<HTMLTableCellElement>) => {
    event.preventDefault();
  }, []);

  const handleHeaderDrop = useCallback(
    (columnIndex: number, event: React.DragEvent<HTMLTableCellElement>) => {
      event.preventDefault();
      reorderColumns(columnIndex);
    },
    [reorderColumns]
  );

  const handleHeaderDragEnd = useCallback(() => {
    dragColumnRef.current = null;
  }, []);

  if (!hasRows) {
    return null;
  }

  return (
    <table ref={tableRef}>
      {headerRow && headerRow.length ? (
        <thead>
          <tr>
            {orderedColumns.map((columnIndex) =>
              hiddenColumnSet?.has(columnIndex) ? null : (
                <th
                  key={`head-${columnIndex}`}
                  ref={(element) => {
                    headerRefs.current[columnIndex] = element;
                  }}
                  style={getColumnStyle(columnIndex)}
                  className="resizable-column"
                  draggable={Boolean(onReorderColumns)}
                  onDragStart={(event) => handleHeaderDragStart(columnIndex, event)}
                  onDragOver={handleHeaderDragOver}
                  onDrop={(event) => handleHeaderDrop(columnIndex, event)}
                  onDragEnd={handleHeaderDragEnd}
                >
                  <CellContent
                    value={headerRow[columnIndex] ?? ""}
                    onImageClick={onImageClick}
                    resolveAssetUrl={resolveAssetUrl}
                  />
                  <span
                    className="column-resize-handle"
                    role="separator"
                    aria-orientation="vertical"
                    onPointerDown={(event) => handleResizePointerDown(columnIndex, event)}
                  />
                </th>
              )
            )}
          </tr>
        </thead>
      ) : null}
      <tbody>
        {bodyRows.map((row, rowIndex) => (
          <tr key={`row-${rowIndex}`}>
            {orderedColumns.map((columnIndex) =>
              hiddenColumnSet?.has(columnIndex) ? null : (
                <td key={`cell-${rowIndex}-${columnIndex}`} style={getColumnStyle(columnIndex)}>
                  <CellContent
                    value={row[columnIndex] ?? ""}
                    onImageClick={onImageClick}
                    resolveAssetUrl={resolveAssetUrl}
                  />
                </td>
              )
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function getMaxColumns(rows: CsvRow[]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}

type CellContentProps = {
  value: string;
  onImageClick: (src: string, caption?: string) => void;
  resolveAssetUrl?: (value: string) => string | null;
};

function CellContent({ value, onImageClick, resolveAssetUrl }: CellContentProps) {
  const trimmed = (value ?? "").trim();
  const resolved = trimmed ? resolveAssetUrl?.(trimmed) ?? trimmed : trimmed;
  const mediaValue = resolved || trimmed;
  const [forceImage, setForceImage] = useState(false);

  useEffect(() => {
    if (!mediaValue || isImageValue(mediaValue) || !isUrl(mediaValue)) {
      setForceImage(false);
      return;
    }

    let cancelled = false;
    const tester = new Image();
    tester.onload = () => {
      if (!cancelled) {
        setForceImage(true);
      }
    };
    tester.onerror = () => {
      if (!cancelled) {
        setForceImage(false);
      }
    };
    tester.src = mediaValue;

    return () => {
      cancelled = true;
    };
  }, [mediaValue]);

  if (!trimmed) {
    return <span>&nbsp;</span>;
  }

  if ((mediaValue && isImageValue(mediaValue)) || forceImage) {
    const src = mediaValue || trimmed;
    return (
      <img
        src={src}
        alt="CSV 图片"
        loading="lazy"
        className="cell-image"
        onClick={() => onImageClick(src, value)}
        role="button"
      />
    );
  }

  if (mediaValue && isUrl(mediaValue)) {
    return (
      <a href={mediaValue} className="cell-link" target="_blank" rel="noopener noreferrer">
        {value}
      </a>
    );
  }

  return <span className="cell-text">{value}</span>;
}

function isImageValue(value: string): boolean {
  const stripped = value.split("?")[0];
  const pattern = /\.(png|jpe?g|gif|bmp|webp|avif|svg)$/i;
  return value.startsWith("data:image/") || pattern.test(stripped);
}

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch (error) {
    return false;
  }
}
