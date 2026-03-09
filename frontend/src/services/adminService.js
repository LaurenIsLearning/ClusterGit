import { authService } from './authService';
import { mockService } from './mockData';
import { getApiBaseUrl } from '../utils/api';

const rawApiUrl = getApiBaseUrl();
const normalizedApiUrl = rawApiUrl.replace(/\/+$/, '');
const API_BASE_URL = normalizedApiUrl.endsWith('/api')
    ? normalizedApiUrl
    : `${normalizedApiUrl}/api`;

async function safeParseJson(response) {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return { _raw: text };
    }
}

function isMissingRoute(response, data) {
    const raw = String(data?._raw || '');
    return response.status === 404 || raw.includes('Cannot GET');
}

async function getAuthHeaders() {
    const session = await authService.getSession();
    if (!session?.access_token) {
        throw new Error('Not authenticated');
    }
    return {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
    };
}

function formatRelativeTime(iso) {
    if (!iso) return 'never';
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) return 'unknown';
    const seconds = Math.floor((Date.now() - ms) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
}

export const adminService = {
    async getSummary() {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/admin/summary`, { method: 'GET', headers });
        const data = await safeParseJson(response);

        if (!response.ok && isMissingRoute(response, data)) {
            throw new Error('Admin API not deployed for this environment (/api/admin/summary missing)');
        }

        if (!response.ok) {
            throw new Error(data.error?.message || data._raw || 'Failed to fetch admin summary');
        }

        return data;
    },

    async getUsers() {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/admin/users`, { method: 'GET', headers });
        const data = await safeParseJson(response);

        if (!response.ok && isMissingRoute(response, data)) {
            throw new Error('Admin API not deployed for this environment (/api/admin/users missing)');
        }

        if (!response.ok) {
            throw new Error(data.error?.message || data._raw || 'Failed to fetch admin users');
        }

        return (data || []).map((user) => ({
            id: user.id,
            name: user.name || 'Unknown',
            email: user.email || '',
            used: Number(((Number(user.used_bytes) || 0) / (1024 ** 3)).toFixed(2)),
            quota: Number(((Number(user.quota_bytes) || 0) / (1024 ** 3)).toFixed(2)),
            lastActive: formatRelativeTime(user.last_active_at),
            lastActiveAt: user.last_active_at || null,
        }));
    },

    async getNodes() {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/admin/nodes`, { method: 'GET', headers });
        const data = await safeParseJson(response);

        if (!response.ok) {
            throw new Error(data.error?.message || data._raw || 'Failed to fetch node telemetry');
        }

        if (Array.isArray(data?.nodes) && data.nodes.length > 0) {
            return data.nodes;
        }

        // Fallback to mock nodes only when telemetry does not exist in Supabase/backend.
        const mock = await mockService.getClusterStatus();
        return mock.nodes;
    },
};

export default adminService;
