import React, { useState } from "react";
import {
  ClipboardDocumentIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import type { TableData } from "@/types/stream";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface ResultsModuleProps {
  data: TableData;
}

interface TabProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const Tab: React.FC<TabProps> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-6 py-4 text-sm font-semibold border-b-2 transition-colors duration-200 ${
      active
        ? "border-violet2 text-violet2 bg-violetLight"
        : "border-transparent text-gray600 hover:text-bistre hover:border-gray300"
    }`}
  >
    {children}
  </button>
);

const ResultsTable: React.FC<{ data: TableData }> = ({ data }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const totalPages = Math.ceil(data.rows.length / itemsPerPage);

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRows = data.rows.slice(startIndex, endIndex);

  const downloadCSV = () => {
    const csvContent = [
      data.columns.map((col) => col.name).join(","),
      ...data.rows.map((row) =>
        data.columns
          .map((column) => {
            const value = row[column.name];
            let cellStr: string;
            if (value === null || value === undefined) {
              cellStr = "";
            } else if (typeof value === "object") {
              cellStr = JSON.stringify(value);
            } else {
              cellStr = String(value);
            }
            if (
              cellStr.includes(",") ||
              cellStr.includes('"') ||
              cellStr.includes("\n")
            ) {
              return `"${cellStr.replace(/"/g, '""')}"`;
            }
            return cellStr;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `query_results_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-4">
      {/* Table Header */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray600">
          {data.rows.length} row{data.rows.length !== 1 ? "s" : ""}
          {data.executionTime && ` • ${data.executionTime}ms`}
        </div>
        <button
          onClick={downloadCSV}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray700 hover:text-bistre hover:bg-gray5 rounded-md transition-colors border border-gray300"
        >
          <ArrowDownTrayIcon className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="border border-gray3 rounded-md overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="results-table">
            <thead>
              <tr>
                {data.columns.map((column, index) => (
                  <th
                    key={index}
                    className="bg-gray5 border-b border-gray3 px-5 py-4 text-left text-xs font-semibold text-gray700 uppercase tracking-wider"
                  >
                    {column.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray3">
              {paginatedRows.map((row, rowIndex) => (
                <tr
                  key={startIndex + rowIndex}
                  className="hover:bg-gray96 transition-colors"
                >
                  {data.columns.map((column, cellIndex) => {
                    const cell = row[column.name];
                    return (
                      <td
                        key={cellIndex}
                        className="px-5 py-4 text-sm text-bistre whitespace-nowrap"
                      >
                        {cell !== null && cell !== undefined
                          ? typeof cell === "object"
                            ? JSON.stringify(cell)
                            : String(cell)
                          : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray600">
            Showing {startIndex + 1} to {Math.min(endIndex, data.rows.length)}{" "}
            of {data.rows.length} results
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 text-sm border border-gray300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray5 text-gray700 hover:text-bistre transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-gray600 px-2">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={currentPage === totalPages}
              className="px-4 py-2 text-sm border border-gray300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray5 text-gray700 hover:text-bistre transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const SQLDisplay: React.FC<{ sql: string }> = ({ sql }) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy SQL:", err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-bistre">
          Generated SQL Query
        </h3>
        <button
          onClick={() => {
            void copyToClipboard();
          }}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray700 hover:text-bistre hover:bg-gray5 rounded-md transition-colors border border-gray300"
        >
          <ClipboardDocumentIcon className="w-4 h-4" />
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <div className="rounded-md overflow-hidden border border-gray3">
        <SyntaxHighlighter
          language="sql"
          style={oneDark}
          showLineNumbers
          customStyle={{
            margin: 0,
            borderRadius: 0,
            fontSize: "14px",
          }}
        >
          {sql}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

export const ResultsModule: React.FC<ResultsModuleProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState<"results" | "sql">("results");

  return (
    <div className="bg-white border border-gray300 rounded-2xl overflow-hidden shadow-sm mt-6 animate-scale-in">
      {/* Tab Navigation */}
      <div className="border-b border-gray300">
        <nav className="flex">
          <Tab
            active={activeTab === "results"}
            onClick={() => setActiveTab("results")}
          >
            Results
          </Tab>
          <Tab active={activeTab === "sql"} onClick={() => setActiveTab("sql")}>
            SQL Query
          </Tab>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === "results" && <ResultsTable data={data} />}
        {activeTab === "sql" && data.sql && <SQLDisplay sql={data.sql} />}
      </div>
    </div>
  );
};
