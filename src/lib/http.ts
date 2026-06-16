import axios from 'axios'
import type { AxiosError } from 'axios'
import { config } from './config'
import type { ApiError } from '../types'

export const http = axios.create({
  baseURL: config.apiBaseUrl,
  withCredentials: true, // attach the SESSION cookie on cross-origin requests
})

/** Normalized error thrown for any non-2xx response (carries the backend's status code/message). */
export class HttpError extends Error {
  /** Backend ApiStatus name, e.g. "BAD_DATA" / "FORBIDDEN", or "NETWORK_ERROR". */
  readonly status: string
  /** HTTP status code, if a response was received. */
  readonly httpStatus?: number

  constructor(message: string, status: string, httpStatus?: number) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.httpStatus = httpStatus
  }
}

http.interceptors.response.use(
  (res) => res,
  (error: AxiosError<ApiError>) => {
    const data = error.response?.data
    return Promise.reject(
      new HttpError(
        data?.message ?? error.message ?? 'Request failed',
        data?.status ?? 'NETWORK_ERROR',
        error.response?.status,
      ),
    )
  },
)
