"use client";

import { memo } from "react";
import styles from "@/css/common-table.module.css";

/**
 * CommonTable - Reusable table component
 * 
 * @param {Array} columns - Array of column definitions: [{ key: 'name', label: 'Name', render: (row) => row.name }]
 * @param {Array} data - Array of data rows
 * @param {Boolean} loading - Loading state
 * @param {String} emptyMessage - Message when no data
 * @param {Function} onRowClick - Optional row click handler
 * @param {Boolean} striped - Enable striped rows
 * @param {String} tableClassName - Additional table class
 */
const CommonTable = memo(({
  columns = [],
  data = [],
  loading = false,
  emptyMessage = "No data available",
  onRowClick,
  striped = true,
  tableClassName = "",
}) => {
  const colSpan = columns.length;

  return (
    <div className={styles.tableContainer}>
      <div className={styles.tableWrapper}>
        <table className={`${styles.table} ${tableClassName} ${striped ? styles.striped : ""}`}>
          <thead>
            <tr>
              {columns.map((col, index) => (
                <th 
                  key={col.key || index} 
                  scope="col"
                  className={col.headerClassName || ""}
                  style={col.width ? { width: col.width } : {}}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colSpan} className={styles.loadingCell}>
                  <div className={styles.loadingContent}>
                    <div className={styles.spinner}></div>
                    <span>Loading...</span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className={styles.emptyCell}>
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>📭</div>
                    <p className={styles.emptyText}>{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => (
                <tr
                  key={row.id || row._id || rowIndex}
                  className={`${styles.tableRow} ${onRowClick ? styles.clickable : ""}`}
                  onClick={() => onRowClick && onRowClick(row)}
                >
                  {columns.map((col, colIndex) => (
                    <td
                      key={`${rowIndex}-${col.key || colIndex}`}
                      className={`${styles.tableCell} ${col.cellClassName || ""}`}
                    >
                      {col.render ? col.render(row, rowIndex) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

CommonTable.displayName = "CommonTable";

export default CommonTable;
