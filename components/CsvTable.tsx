"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import type { CsvRow } from "@/lib/csv";

type CsvTableProps = {
  rows: CsvRow[];
  onImageClick: (src: string, caption?: string) => void;
  resolveAssetUrl?: (value: string) => string | null;
};

export default function CsvTable({ rows, onImageClick, resolveAssetUrl }: CsvTableProps) {
  if (!rows.length) {
    return null;
  }

  const [headerRow, ...bodyRows] = rows;
  const maxColumns = Math.max(getMaxColumns(rows), 1);

  return (
    <table>
      {headerRow && headerRow.length ? (
        <thead>
          <tr>
            {Array.from({ length: maxColumns }).map((_, index) => (
              <th key={`head-${index}`}>
                <CellContent
                  value={headerRow[index] ?? ""}
                  onImageClick={onImageClick}
                  resolveAssetUrl={resolveAssetUrl}
                />
              </th>
            ))}
          </tr>
        </thead>
      ) : null}
      <tbody>
        {bodyRows.map((row, rowIndex) => (
          <tr key={`row-${rowIndex}`}>
            {Array.from({ length: maxColumns }).map((_, columnIndex) => (
              <td key={`cell-${rowIndex}-${columnIndex}`}>
                <CellContent
                  value={row[columnIndex] ?? ""}
                  onImageClick={onImageClick}
                  resolveAssetUrl={resolveAssetUrl}
                />
              </td>
            ))}
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
