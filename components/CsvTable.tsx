"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CsvRow } from "@/lib/csv";

const MIN_COLUMN_WIDTH = 160;

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
  const dragOriginRectRef = useRef<DOMRect | null>(null);
  const [draggingColumn, setDraggingColumn] = useState<number | null>(null);
  const [previewOrder, setPreviewOrder] = useState<number[] | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

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

  const columnStylesByIndex = useMemo(() => {
    if (!maxColumns) {
      return [] as Array<ReturnType<typeof getColumnStyle>>;
    }
    return Array.from({ length: maxColumns }, (_, index) => getColumnStyle(index));
  }, [getColumnStyle, maxColumns]);

  type ColumnSlot = {
    columnIndex: number;
    insertBefore: boolean;
  };

  const measurementOrder = useMemo(
    () => orderedColumns.filter((index) => !hiddenColumnSet?.has(index)),
    [hiddenColumnSet, orderedColumns]
  );

  const visibleSlotStyles = useMemo(
    () => measurementOrder.map((columnIndex) => columnStylesByIndex[columnIndex]),
    [columnStylesByIndex, measurementOrder]
  );

  const findColumnSlotByPointer = useCallback(
    (clientX: number): ColumnSlot | null => {
      if (!measurementOrder.length) {
        return null;
      }

      const columnRects = measurementOrder
        .map((columnIndex) => {
          const cell = headerRefs.current[columnIndex];
          if (!cell) {
            return null;
          }
          return { columnIndex, rect: cell.getBoundingClientRect() };
        })
        .filter((entry): entry is { columnIndex: number; rect: DOMRect } => Boolean(entry));

      if (!columnRects.length) {
        return null;
      }

      const sourceColumn = dragColumnRef.current;
      if (sourceColumn == null) {
        return null;
      }
      const sourceIndex = columnRects.findIndex((entry) => entry.columnIndex === sourceColumn);
      if (sourceIndex === -1) {
        return null;
      }

      const originRect = dragOriginRectRef.current ?? columnRects[sourceIndex]?.rect;
      if (!originRect) {
        return null;
      }

      const movingRight = clientX >= originRect.right;
      const movingLeft = clientX <= originRect.left;

      if (movingRight) {
        for (let index = sourceIndex + 1; index < columnRects.length; index += 1) {
          const entry = columnRects[index];
          const { rect } = entry;
          if (rect.left <= clientX && clientX < rect.right) {
            return { columnIndex: entry.columnIndex, insertBefore: false };
          }
        }
        const last = columnRects[columnRects.length - 1];
        if (last && last.columnIndex !== sourceColumn) {
          return { columnIndex: last.columnIndex, insertBefore: false };
        }
        return null;
      }

      if (movingLeft) {
        for (let index = sourceIndex - 1; index >= 0; index -= 1) {
          const entry = columnRects[index];
          const { rect } = entry;
          if (rect.left <= clientX && clientX < rect.right) {
            return { columnIndex: entry.columnIndex, insertBefore: true };
          }
        }
        const first = columnRects[0];
        if (first && first.columnIndex !== sourceColumn) {
          return { columnIndex: first.columnIndex, insertBefore: true };
        }
        return null;
      }

      const sourceRect = columnRects[sourceIndex]?.rect;
      if (sourceRect && clientX >= sourceRect.left && clientX <= sourceRect.right) {
        return { columnIndex: sourceColumn, insertBefore: true };
      }

      return null;
    },
    [measurementOrder]
  );

  const updatePreviewForSlot = useCallback(
    (slot: ColumnSlot | null) => {
      const sourceColumn = dragColumnRef.current;
      if (sourceColumn == null || !slot) {
        return;
      }
      const baseOrder = orderedColumns;
      const fromIndex = baseOrder.indexOf(sourceColumn);
      const targetIndex = baseOrder.indexOf(slot.columnIndex);
      if (fromIndex === -1 || targetIndex === -1) {
        return;
      }
      let insertIndex = slot.insertBefore ? targetIndex : targetIndex + 1;
      if (insertIndex > baseOrder.length) {
        insertIndex = baseOrder.length;
      }
      if (fromIndex < insertIndex) {
        insertIndex -= 1;
      }
      if (insertIndex === fromIndex) {
        setPreviewOrder(baseOrder);
        return;
      }
      const nextOrder = [...baseOrder];
      nextOrder.splice(fromIndex, 1);
      nextOrder.splice(insertIndex, 0, sourceColumn);
      setPreviewOrder(nextOrder);
    },
    [orderedColumns]
  );

  useLayoutEffect(() => {
    const firstVisible = orderedColumns.find((index) => !hiddenColumnSet?.has(index));
    if (firstVisible == null) {
      setHeaderHeight(0);
      return;
    }
    const cell = headerRefs.current[firstVisible];
    if (!cell) {
      setHeaderHeight(0);
      return;
    }
    const updateHeight = () => {
      setHeaderHeight(cell.getBoundingClientRect().height);
    };
    updateHeight();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => updateHeight());
      observer.observe(cell);
      return () => observer.disconnect();
    }
    return () => {
      /* no-op */
    };
  }, [hiddenColumnSet, orderedColumns]);

  const reorderColumns = useCallback(
    (targetColumn: number) => {
      if (!onReorderColumns) {
        return;
      }
      const sourceColumn = dragColumnRef.current;
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
      const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
      nextOrder.splice(adjustedIndex, 0, sourceColumn);
      onReorderColumns(nextOrder);
    },
    [onReorderColumns, orderedColumns]
  );

  const handleHeaderDragStart = useCallback(
    (columnIndex: number, event: React.DragEvent<HTMLTableCellElement>) => {
      dragColumnRef.current = columnIndex;
      dragOriginRectRef.current = headerRefs.current[columnIndex]?.getBoundingClientRect() ?? null;
      setDraggingColumn(columnIndex);
      setPreviewOrder(orderedColumns);
      event.dataTransfer?.setData("text/plain", columnIndex.toString());
      event.dataTransfer?.setDragImage?.(event.currentTarget, 0, 0);
      event.dataTransfer.effectAllowed = "move";
    },
    [orderedColumns]
  );

  const handleHeaderDragEnter = useCallback(
    (columnIndex: number, event: React.DragEvent<HTMLTableCellElement>) => {
      if (!onReorderColumns) {
        return;
      }
      event.preventDefault();
      const slot = findColumnSlotByPointer(event.clientX) ?? { columnIndex, insertBefore: true };
      updatePreviewForSlot(slot);
    },
    [findColumnSlotByPointer, onReorderColumns, updatePreviewForSlot]
  );

  const handleHeaderDragOver = useCallback(
    (event: React.DragEvent<HTMLTableCellElement>) => {
      if (!onReorderColumns) {
        return;
      }
      event.preventDefault();
      const slot = findColumnSlotByPointer(event.clientX);
      if (slot) {
        updatePreviewForSlot(slot);
      }
    },
    [findColumnSlotByPointer, onReorderColumns, updatePreviewForSlot]
  );

  const handleHeaderDrop = useCallback(
    (columnIndex: number, event: React.DragEvent<HTMLTableCellElement>) => {
      if (!onReorderColumns) {
        return;
      }
      event.preventDefault();
      if (previewOrder && previewOrder.length === orderedColumns.length) {
        onReorderColumns(previewOrder);
      } else {
        reorderColumns(columnIndex);
      }
      dragColumnRef.current = null;
      dragOriginRectRef.current = null;
      setDraggingColumn(null);
      setPreviewOrder(null);
    },
    [onReorderColumns, orderedColumns.length, previewOrder, reorderColumns]
  );

  const handleHeaderDragEnd = useCallback(() => {
    if (previewOrder && previewOrder.length === orderedColumns.length && onReorderColumns) {
      onReorderColumns(previewOrder);
    }
    dragColumnRef.current = null;
    dragOriginRectRef.current = null;
    setDraggingColumn(null);
    setPreviewOrder(null);
  }, [onReorderColumns, orderedColumns.length, previewOrder]);

  if (!hasRows) {
    return null;
  }

  return (
    <div className={`csv-table-container${previewOrder ? " is-drag-preview" : ""}`}>
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
                    style={columnStylesByIndex[columnIndex]}
                    className={`resizable-column${draggingColumn === columnIndex ? " is-dragging" : ""}`}
                    draggable={Boolean(onReorderColumns)}
                    onDragStart={(event) => handleHeaderDragStart(columnIndex, event)}
                    onDragEnter={(event) => handleHeaderDragEnter(columnIndex, event)}
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
                <td key={`cell-${rowIndex}-${columnIndex}`} style={columnStylesByIndex[columnIndex]}>
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
    {previewOrder ? (
      <div className="column-drag-preview" style={{ height: headerHeight || undefined }} aria-hidden="true">
        {(() => {
          let slotIndex = -1;
          return previewOrder.map((columnIndex) => {
            if (hiddenColumnSet?.has(columnIndex)) {
              return null;
            }
            slotIndex += 1;
            const slotStyle = visibleSlotStyles[slotIndex];
            return (
              <div
                key={`preview-${columnIndex}`}
                className={`column-drag-preview-item${draggingColumn === columnIndex ? " is-active" : ""}`}
                style={slotStyle}
              >
                <CellContent
                  value={headerRow[columnIndex] ?? ""}
                  onImageClick={onImageClick}
                  resolveAssetUrl={resolveAssetUrl}
                />
              </div>
            );
          });
        })()}
      </div>
    ) : null}
  </div>
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
  const looksLikeImage = isImageValue(trimmed);
  const [forceImage, setForceImage] = useState(looksLikeImage);

  useEffect(() => {
    if (!mediaValue || isImageValue(mediaValue) || looksLikeImage || !isUrl(mediaValue)) {
      setForceImage(looksLikeImage);
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

  if (looksLikeImage || (mediaValue && isImageValue(mediaValue)) || forceImage) {
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
