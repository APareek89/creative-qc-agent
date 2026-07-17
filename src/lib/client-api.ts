"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Batch, DashboardData, RuntimeHealth } from "@/lib/types";

export class ApiRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) {
    let message = `Request failed with HTTP ${response.status}.`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // A provider/proxy may return a non-JSON error page; retain the HTTP message.
    }
    throw new ApiRequestError(message, response.status);
  }
  return response.json() as Promise<T>;
}

export function useBatch(id: string, polling = true) {
  const [batch, setBatch] = useState<Batch>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const active = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const value = await apiRequest<Batch>(`/api/batches/${id}`);
      if (active.current) {
        setBatch(value);
        setError(undefined);
      }
      return value;
    } catch (requestError) {
      if (active.current) setError(requestError instanceof Error ? requestError.message : "Could not load this batch.");
      return undefined;
    } finally {
      if (active.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    active.current = true;
    void refresh();
    const interval = polling ? window.setInterval(() => void refresh(), 1_500) : undefined;
    return () => {
      active.current = false;
      if (interval) window.clearInterval(interval);
    };
  }, [polling, refresh]);

  return { batch, setBatch, error, loading, refresh };
}

export function useDashboard() {
  const [data, setData] = useState<DashboardData>();
  const [health, setHealth] = useState<RuntimeHealth>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [dashboardResult, healthResult] = await Promise.allSettled([
      apiRequest<DashboardData>("/api/batches"),
      apiRequest<RuntimeHealth>("/api/health"),
    ]);
    if (dashboardResult.status === "fulfilled") setData(dashboardResult.value);
    if (healthResult.status === "fulfilled") setHealth(healthResult.value);
    const requestError = dashboardResult.status === "rejected"
      ? dashboardResult.reason
      : healthResult.status === "rejected"
        ? healthResult.reason
        : undefined;
    setError(requestError instanceof Error ? requestError.message : requestError ? "Could not load the dashboard." : undefined);
    setLoading(false);
  }, []);

  useEffect(() => void refresh(), [refresh]);
  return { data, health, error, loading, refresh };
}
