import { toast } from 'sonner'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function getToken() {
  return localStorage.getItem('morax_access_token')
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem('morax_access_token', token)
  else localStorage.removeItem('morax_access_token')
}

async function parseResponse(response: Response) {
  const body = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const detail = typeof body?.detail === 'string' ? body.detail : body?.detail?.[0]?.msg
    throw new ApiError(response.status, detail ?? 'The request could not be completed.')
  }
  return body
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API_URL}${path}`, { ...init, headers })
  try {
    const result = await parseResponse(response) as T
    const method = (init.method ?? 'GET').toUpperCase()
    if (!path.startsWith('/auth/') && method !== 'GET') toast.success(changeMessage(path, method))
    return result
  } catch (error) {
    const method = (init.method ?? 'GET').toUpperCase()
    if (!path.startsWith('/auth/') && method !== 'GET') toast.error('Unable to complete the requested action. Please review the form and try again.')
    throw error
  }
}

function changeMessage(path: string, method: string) {
  const resource = path.includes('/platform/organizations') ? 'Organization'
    : path.startsWith('/units') ? 'Unit'
      : path.startsWith('/contractors') ? 'Contractor'
        : path.startsWith('/users') ? 'User'
          : path.includes('/documents') || path.includes('/evidence') ? 'Document'
            : path.includes('/compliance') ? 'Compliance' : 'Changes'
  if (method === 'DELETE') return `${resource} deleted successfully.`
  if (/login-as-organization/.test(path)) return 'Organization session opened successfully.'
  if (/reset-password|\/status$|development-reset/.test(path)) return `${resource} updated successfully.`
  if (method === 'POST' && /upload|documents|evidence/.test(path)) return `${resource} uploaded successfully.`
  if (method === 'POST') return `${resource} created successfully.`
  return `${resource} updated successfully.`
}

export async function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  return api<T>(path, { method: 'POST', body: form })
}

export async function download(path: string, filename: string) {
  const token = getToken()
  const response = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!response.ok) await parseResponse(response)
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click()
  URL.revokeObjectURL(url)
}
