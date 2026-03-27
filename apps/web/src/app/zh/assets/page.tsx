"use client";

import { getValidSession, toApiUrl } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type TaskRow = {
  id: string;
  type: string;
  status: "queued" | "running" | "completed" | "failed";
  pointsCost: number;
  pointsRefunded?: boolean;
  createdAt: string;
  updatedAt: string;
};

type TaskDownloadTicketResponse = {
  downloadPath: string;
};

type TaskDownloadResolveResponse = {
  downloadUrl?: string;
  message?: string;
};

function statusLabel(status: TaskRow["status"]) {
  if (status === "queued") return "Queued";
  if (status === "running") return "Running";
  if (status === "completed") return "Completed";
  return "Failed";
}

function statusClass(status: TaskRow["status"]) {
  if (status === "completed") return "text-[#218a53]";
  if (status === "running") return "text-[#2b69c4]";
  if (status === "queued") return "text-[#68739b]";
  return "text-[#bf3f3f]";
}

export default function AssetsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [downloadingTaskId, setDownloadingTaskId] = useState<string | null>(null);

  const loadTasks = async () => {
    const session = getValidSession();
    if (!session) {
      setErrorMessage("Session expired. Please login again.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch(toApiUrl("/api/v1/tasks"), {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
      });

      if (response.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }

      if (!response.ok) {
        setErrorMessage("Failed to load task history.");
        setLoading(false);
        return;
      }

      const data = (await response.json()) as TaskRow[];
      setRows(data);
    } catch {
      setErrorMessage("Network error while loading task history.");
    } finally {
      setLoading(false);
    }
  };

  const downloadTaskFile = async (taskId: string) => {
    const session = getValidSession();
    if (!session) {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    setDownloadingTaskId(taskId);
    setErrorMessage("");
    try {
      const ticketResponse = await fetch(toApiUrl(`/api/v1/tasks/${taskId}/download-link`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      });

      if (ticketResponse.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (!ticketResponse.ok) {
        const data = (await ticketResponse.json().catch(() => null)) as { message?: string } | null;
        setErrorMessage(data?.message || "Failed to create secure download link.");
        return;
      }

      const ticketData = (await ticketResponse.json()) as TaskDownloadTicketResponse;
      const resolveResponse = await fetch(toApiUrl(ticketData.downloadPath), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      });

      if (resolveResponse.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (!resolveResponse.ok) {
        const data = (await resolveResponse.json().catch(() => null)) as { message?: string } | null;
        setErrorMessage(data?.message || "Secure download link expired, please retry.");
        return;
      }

      const resolved = (await resolveResponse.json()) as TaskDownloadResolveResponse;
      if (!resolved.downloadUrl) {
        setErrorMessage(resolved.message || "Download URL unavailable.");
        return;
      }

      const finalUrl = /^https?:\/\//i.test(resolved.downloadUrl) ? resolved.downloadUrl : toApiUrl(resolved.downloadUrl);
      window.open(finalUrl, "_blank", "noopener,noreferrer");
    } catch {
      setErrorMessage("Network error while downloading file.");
    } finally {
      setDownloadingTaskId(null);
    }
  };

  useEffect(() => {
    void loadTasks();
    // We intentionally run once on mount for initial history fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <section className="dashboard-card p-5">
        <h1 className="text-2xl font-semibold text-[#242d4d]">My Assets</h1>
        <p className="mt-1 text-sm text-[#69739b]">Review your task history, status, points usage, and downloadable files.</p>
      </section>

      <section className="dashboard-card p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[#2a3151]">Task History</h2>
          <button
            onClick={() => void loadTasks()}
            className="rounded-lg border border-[#d8defe] bg-white px-3 py-1.5 text-sm text-[#4f59a1]"
          >
            Refresh
          </button>
        </div>

        {loading ? <p className="text-sm text-[#6f789f]">Loading...</p> : null}
        {errorMessage ? <p className="text-sm text-[#bf3f3f]">{errorMessage}</p> : null}

        {!loading && !errorMessage ? (
          <div className="overflow-auto rounded-xl border border-[#e1e6ff]">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead className="bg-[#f7f8ff] text-left text-[#6671a1]">
                <tr>
                  <th className="px-3 py-2 font-medium">Task ID</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Points</th>
                  <th className="px-3 py-2 font-medium">Refunded</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-[#eef2ff] text-[#39416d]">
                    <td className="px-3 py-2">{row.id}</td>
                    <td className="px-3 py-2">{row.type}</td>
                    <td className={`px-3 py-2 font-medium ${statusClass(row.status)}`}>{statusLabel(row.status)}</td>
                    <td className="px-3 py-2">{row.pointsCost}</td>
                    <td className="px-3 py-2">{row.pointsRefunded ? "Yes" : "No"}</td>
                    <td className="px-3 py-2">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      {row.status === "completed" ? (
                        <button
                          onClick={() => void downloadTaskFile(row.id)}
                          disabled={downloadingTaskId === row.id}
                          className="rounded border border-[#d8defe] px-2 py-1 text-xs text-[#4f59a1] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {downloadingTaskId === row.id ? "Preparing..." : "Download"}
                        </button>
                      ) : (
                        <span className="text-xs text-[#7c86af]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr className="border-t border-[#eef2ff] text-[#6f789f]">
                    <td className="px-3 py-6 text-center" colSpan={7}>
                      No task history yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
