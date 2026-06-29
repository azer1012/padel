import { supabase } from "@/lib/supabase";
import type { ApiErrorResponse } from "@/types/api";

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = "/api") {
    this.baseUrl = baseUrl;
  }

  private async getAuthHeader(): Promise<Record<string, string>> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return {};
    }

    return {
      Authorization: `Bearer ${session.access_token}`,
    };
  }

  async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      headers?: Record<string, string>;
    },
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const authHeaders = await this.getAuthHeader();

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...options?.headers,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const error = (await response.json()) as ApiErrorResponse;
      throw new Error(error.error.message || "API request failed");
    }

    return response.json();
  }

  get<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>("GET", path, { headers });
  }

  post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>("POST", path, { body, headers });
  }

  put<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>("PUT", path, { body, headers });
  }

  patch<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>("PATCH", path, { body, headers });
  }

  delete<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>("DELETE", path, { headers });
  }
}

export const apiClient = new ApiClient();
