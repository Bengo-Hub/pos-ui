import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { isSubscriptionError } from '@/lib/api/error-handler';
import { isNetworkShapedError, reportNetworkFailure, reportNetworkSuccess } from '@/lib/connectivity';

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** Set on background revalidates so a failed refresh never fires the global 5xx toast. */
    suppressErrorToast?: boolean;
  }
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://posapi.codevertexafrica.com';

class ApiClient {
  private instance: AxiosInstance;
    private accessToken: string | null = null;
    private tenantId: string | null = null;
    private tenantSlug: string | null = null;
    private platformOwner = false;
    private outletId: string | null = null;

    constructor() {
        this.instance = axios.create({
            baseURL: apiBaseUrl,
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 15000,
        });

        this.instance.interceptors.request.use(this.handleRequest);
        this.instance.interceptors.response.use(this.handleResponse, this.handleError);
    }

    private handleRequest = (config: InternalAxiosRequestConfig) => {
        if (this.accessToken) {
            config.headers.Authorization = `Bearer ${this.accessToken}`;
        }
        if (!this.platformOwner) {
            if (this.tenantId) {
                config.headers['X-Tenant-ID'] = this.tenantId;
            }
            if (this.tenantSlug) {
                config.headers['X-Tenant-Slug'] = this.tenantSlug;
            }
        }
        if (this.outletId) {
            config.headers['X-Outlet-ID'] = this.outletId;
            // Outlet scope ALSO travels as a query param on reads: several list/report handlers
            // filter on ?outlet_id= (not the header), so the selected outlet must reach every
            // outlet-scoped endpoint. Explicit params always win (e.g. an "all" outlets filter
            // or a page passing its own outlet) — we only fill the gap when absent.
            const method = (config.method ?? 'get').toLowerCase();
            if (method === 'get') {
                const params = (config.params ?? {}) as Record<string, unknown>;
                if (params.outlet_id === undefined) {
                    params.outlet_id = this.outletId;
                    config.params = params;
                }
            }
        }
        return config;
    };

    private handleResponse = (response: AxiosResponse) => {
        // Any response at all means the API was reachable — feed the connectivity signal.
        reportNetworkSuccess();
        return response;
    };

    private on401Callback: (() => void) | null = null;
    private onSubscription403Callback: ((data: any) => void) | null = null;
    private onLimitReachedCallback: ((data: any) => void) | null = null;
    private onServerErrorCallback: ((status: number, message: string) => void) | null = null;

    /** Register a callback to run when any API response is 401 (e.g. clear session / redirect to auth). */
    public setOn401(callback: (() => void) | null) {
        this.on401Callback = callback;
    }

    /** Register a callback for subscription-related 403 errors (feature gates, plan limits, inactive subscription). */
    public setOnSubscription403(callback: ((data: any) => void) | null) {
        this.onSubscription403Callback = callback;
    }

    /** Register a callback for 402 metered-limit-reached errors (opens the extra-usage modal). */
    public setOnLimitReached(callback: ((data: any) => void) | null) {
        this.onLimitReachedCallback = callback;
    }

    /** Register a callback for 5xx server errors to show a global error toast. */
    public setOnServerError(callback: ((status: number, message: string) => void) | null) {
        this.onServerErrorCallback = callback;
    }

    private handleError = async (error: any) => {
        // Feed the effective-connectivity signal: transport failures (timeout/unreachable/
        // gateway) count towards effectively-offline; any real HTTP response counts as
        // reachable even when it is an error status.
        if (isNetworkShapedError(error)) {
            reportNetworkFailure();
        } else if (error.response) {
            reportNetworkSuccess();
        }
        if (error.response?.status === 401) {
            // If token is already cleared (explicit logout in progress), skip entirely
            if (!this.accessToken) return Promise.reject(error);

            const url: string = error.config?.url ?? '';
            if (!url.includes('/auth/me') && !error.config?._retried) {
                const { refreshAccessToken } = await import('@/lib/auth/token-refresh');
                const newToken = await refreshAccessToken();

                if (newToken) {
                    this.accessToken = newToken;
                    error.config._retried = true;
                    error.config.headers.Authorization = `Bearer ${newToken}`;
                    return this.instance.request(error.config);
                }

                this.on401Callback?.();
            }
        }
        if (error.response?.status === 403) {
            const data = error.response?.data;
            if (isSubscriptionError(data) && this.onSubscription403Callback) {
                this.onSubscription403Callback(data);
            }
        }
        // 402 Payment Required = a metered limit was hit. Open the extra-usage modal
        // (the body carries the overage price + eligibility from subscription-service).
        if (error.response?.status === 402) {
            const data = error.response?.data;
            if (this.onLimitReachedCallback) {
                this.onLimitReachedCallback(data);
            }
        }
        if (error.response?.status >= 500 && this.onServerErrorCallback && !error.config?.suppressErrorToast) {
            const data = error.response?.data;
            const message = data?.message ?? data?.error ?? 'A server error occurred. Please try again.';
            this.onServerErrorCallback(error.response.status, message);
        }
        // Normalize the real backend message onto the error so call sites can show it
        // (instead of a generic "Failed to …"). Handles Blob bodies from responseType:'blob'.
        try {
            const { apiErrorMessage } = await import('./error-message');
            const msg = await apiErrorMessage(error, '');
            if (msg) (error as { normalizedMessage?: string }).normalizedMessage = msg;
        } catch {
            /* never let normalization mask the original error */
        }
        return Promise.reject(error);
    };

    public setAccessToken(token: string | null) {
        this.accessToken = token;
    }

    /** Current access token — used to authenticate WebSocket URLs via ?access_token= */
    public getAccessToken(): string | null {
        return this.accessToken;
    }

    public setTenantInfo(id: string | null, slug: string | null) {
        this.tenantId = id;
        this.tenantSlug = slug;
    }

    public setPlatformOwner(isPlatformOwner: boolean) {
        this.platformOwner = isPlatformOwner;
    }

    /** Set the outlet ID to include as X-Outlet-ID on every request (HQ/admin drill-down). */
    public setOutletID(outletId: string | null) {
        this.outletId = outletId;
    }

  /** Returns current auth headers for use with raw fetch() (e.g. SSE streams). */
  public getAuthHeaders(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.accessToken) h['Authorization'] = `Bearer ${this.accessToken}`;
    if (!this.platformOwner) {
      if (this.tenantId) h['X-Tenant-ID'] = this.tenantId;
      if (this.tenantSlug) h['X-Tenant-Slug'] = this.tenantSlug;
    }
    if (this.outletId) h['X-Outlet-ID'] = this.outletId;
    return h;
  }

  public get<T>(url: string, params?: any, config?: { suppressErrorToast?: boolean; timeout?: number }): Promise<T> {
    return this.instance.get<T>(url, { params, ...config }).then((res: AxiosResponse<T>) => res.data);
  }

  /**
   * Fetch a file as a Blob through the authenticated axios instance (Authorization header
   * attached). Use this for CSV/PDF downloads instead of a bare <a href> — a plain anchor
   * navigation does NOT send the bearer token, so the request 401s and the browser shows
   * "file wasn't available on site".
   */
  public getBlob(url: string, params?: any): Promise<Blob> {
    return this.instance
      .get(url, { params, responseType: 'blob' })
      .then((res: AxiosResponse<Blob>) => res.data);
  }

  public post<T>(url: string, data?: any, config?: { headers?: Record<string, string>; suppressErrorToast?: boolean; timeout?: number }): Promise<T> {
    return this.instance.post<T>(url, data, config).then((res: AxiosResponse<T>) => res.data);
  }

  public put<T>(url: string, data?: any, config?: { headers?: Record<string, string> }): Promise<T> {
    return this.instance.put<T>(url, data, config).then((res: AxiosResponse<T>) => res.data);
  }

  public patch<T>(url: string, data?: any, config?: { headers?: Record<string, string> }): Promise<T> {
    return this.instance.patch<T>(url, data, config).then((res: AxiosResponse<T>) => res.data);
  }

  public delete<T>(url: string, config?: { data?: any; headers?: Record<string, string> }): Promise<T> {
    return this.instance.delete<T>(url, config).then((res: AxiosResponse<T>) => res.data);
  }
}

export const apiClient = new ApiClient();
