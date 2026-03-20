import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://posapi.codevertexitsolutions.com';

class ApiClient {
  private instance: AxiosInstance;
    private accessToken: string | null = null;
    private tenantId: string | null = null;
    private tenantSlug: string | null = null;
    private platformOwner = false;

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
        return config;
    };

    private handleResponse = (response: AxiosResponse) => response;

    private handleError = (error: any) => {
        if (error.response?.status === 401) {
            console.warn('API Unauthorized access');
        }
        return Promise.reject(error);
    };

    public setAccessToken(token: string | null) {
        this.accessToken = token;
    }

    public setTenantInfo(id: string | null, slug: string | null) {
        this.tenantId = id;
        this.tenantSlug = slug;
    }

    public setPlatformOwner(isPlatformOwner: boolean) {
        this.platformOwner = isPlatformOwner;
    }

  public get<T>(url: string, params?: any): Promise<T> {
    return this.instance.get<T>(url, { params }).then((res: AxiosResponse<T>) => res.data);
  }

  public post<T>(url: string, data?: any): Promise<T> {
    return this.instance.post<T>(url, data).then((res: AxiosResponse<T>) => res.data);
  }

  public put<T>(url: string, data?: any): Promise<T> {
    return this.instance.put<T>(url, data).then((res: AxiosResponse<T>) => res.data);
  }

  public patch<T>(url: string, data?: any): Promise<T> {
    return this.instance.patch<T>(url, data).then((res: AxiosResponse<T>) => res.data);
  }

  public delete<T>(url: string): Promise<T> {
    return this.instance.delete<T>(url).then((res: AxiosResponse<T>) => res.data);
  }
}

export const apiClient = new ApiClient();
