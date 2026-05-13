const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001'

async function request(path: string, options: RequestInit = {}) {
  const userId = localStorage.getItem('userId') || 'demo-user'
  const wsId = localStorage.getItem('currentWorkspaceId') || ''
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
      'x-workspace-id': wsId,
      ...options.headers,
    },
  })
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`)
  return res.json()
}

export const api = {
  workspaces: {
    list: () => request('/api/workspaces/workspaces'),
    create: (data: Record<string, unknown>) => request('/api/workspaces', { method: 'POST', body: JSON.stringify(data) }),
    switch: (id: string) => request(`/api/workspaces/${id}/switch`, { method: 'POST' }),
  },
  tasks: {
    list: (filters?: Record<string, string>) => {
      const q = filters ? '?' + new URLSearchParams(filters).toString() : ''
      return request(`/api/tasks${q}`)
    },
    create: (data: Record<string, unknown>) => request('/api/tasks', { method: 'POST', body: JSON.stringify(data) }),
    updateStatus: (id: string, status: string, reason?: string) =>
      request(`/api/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }),
    delete: (id: string) => request(`/api/tasks/${id}`, { method: 'DELETE' }),
  },
  ilink: {
    createBindToken: () => request('/api/ilink/bind/wechat', { method: 'POST' }),
    checkBindStatus: (token: string) => request(`/api/ilink/bind/status?token=${token}`),
    confirmBind: (token: string, wxUserId: string, soulId?: string) =>
      request('/api/ilink/bind/confirm', { method: 'POST', body: JSON.stringify({ token, wxUserId, soulId }) }),
  },
}
