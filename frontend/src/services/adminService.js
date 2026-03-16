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
    // attaches the supabase access token to admin api calls
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

function bytesToGiB(bytes) {
    return Number(((Number(bytes) || 0) / (1024 ** 3)).toFixed(2));
}

function normalizeNodeTelemetry(node) {
    const storageUsedPercent = Number(
        node?.storage?.used
        ?? node?.storage_used_percent
        ?? 0
    ) || 0;

    const storageUsedBytes = Number(
        node?.storage?.used_bytes
        ?? node?.storageUsedBytes
        ?? 0
    ) || 0;

    const storageTotalBytes = Number(
        node?.storage?.total_bytes
        ?? node?.storageTotalBytes
        ?? 0
    ) || 0;

    return {
        id: node?.id || 'unknown-node',
        ip: node?.ip || '',
        status: node?.status || 'unknown',
        cpuPercent: Number(node?.cpu ?? node?.cpuPercent ?? 0) || 0,
        temperatureC: node?.temp == null && node?.temp_c == null && node?.temperatureC == null
            ? null
            : Number(node?.temp ?? node?.temp_c ?? node?.temperatureC ?? 0),
        heartbeatAt: node?.heartbeat_at || node?.heartbeatAt || null,
        uptimeLabel: node?.uptime || null,
        storageUsedPercent,
        storageUsedBytes,
        storageTotalBytes,
    };
}

export const adminService = {
    async listUsers() {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/admin/users`, { method: 'GET', headers });
        const data = await safeParseJson(response);

        if (!response.ok && isMissingRoute(response, data)) {
            throw new Error('Admin API not deployed for this environment (/api/admin/users missing)');
        }

        if (!response.ok) {
            throw new Error(data.error?.message || data._raw || 'Failed to fetch admin users');
        }

        return {
            environment_key: data.environment_key || null,
            users: (data.users || []).map((user) => ({
                id: user.id,
                display_name: user.name || 'Unknown',
                name: user.name || 'Unknown',
                email: user.email || '',
                storage_quota_bytes: Number(user.quota_bytes) || 0,
                storage_quota_mb: Math.round((Number(user.quota_bytes) || 0) / (1024 ** 2)),
                storage_used_bytes: Number(user.used_bytes) || 0,
                repo_count: Number(user.repo_count) || 0,
                is_admin_created: Boolean(user.is_admin_created),
                has_review_request: Boolean(user.has_review_request),
                review_requested_at: user.review_requested_at || null,
                review_detail: user.review_detail || '',
                review_repo_id: user.review_repo_id || null,
                last_active_at: user.last_active_at || null,
            })),
        };
    },

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
        const data = await this.listUsers();
        return {
            environmentKey: data.environment_key || null,
            users: (data.users || []).map((user) => ({
                id: user.id,
                name: user.name || user.display_name || 'Unknown',
                email: user.email || '',
                used: bytesToGiB(user.storage_used_bytes),
                quota: bytesToGiB(user.storage_quota_bytes),
                usedBytes: Number(user.storage_used_bytes) || 0,
                quotaBytes: Number(user.storage_quota_bytes) || 0,
                repoCount: Number(user.repo_count) || 0,
                isAdminCreated: Boolean(user.is_admin_created),
                hasReviewRequest: Boolean(user.has_review_request),
                reviewRequestedAt: user.review_requested_at || null,
                reviewDetail: user.review_detail || '',
                reviewRepoId: user.review_repo_id || null,
                lastActive: formatRelativeTime(user.last_active_at),
                lastActiveAt: user.last_active_at || null,
            })),
        };
    },

    async createStudent({ email, password, displayName, display_name, storageQuotaBytes }) {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/admin/users`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                email,
                password,
                display_name: displayName || display_name,
                storage_quota_bytes: storageQuotaBytes,
            }),
        });
        const data = await safeParseJson(response);

        if (!response.ok) {
            throw new Error(data.error?.message || data._raw || 'Failed to create student');
        }

        return data;
    },

    async getUserDetail(userId) {
        const usersPayload = await this.listUsers();
        const profile = (usersPayload.users || []).find((user) => user.id === userId);

        if (!profile) {
            throw new Error('Student not found');
        }

        const reposPayload = await this.getUserRepos(userId);
        const repositories = await Promise.all((reposPayload.repos || []).map(async (repo) => {
            const filesPayload = await this.getRepoFiles(repo.id);
            return {
                id: repo.id,
                name: repo.name,
                description: repo.reviewDetail || '',
                clone_url: repo.gitUrl || '',
                repo_path: '',
                updated_at: repo.lastActivityAt || repo.createdAt || null,
                files: (filesPayload.files || []).map((file) => ({
                    id: file.id,
                    path: file.path || file.name || '',
                    size_bytes: file.sizeBytes || 0,
                    last_modified: file.uploadedAt || null,
                })),
            };
        }));

        return {
            profile,
            repositories,
        };
    },

    async updateUserQuota(userId, storageQuotaBytes) {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/quota`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ storage_quota_bytes: storageQuotaBytes }),
        });
        const data = await safeParseJson(response);

        if (!response.ok) {
            throw new Error(data.error?.message || data._raw || 'Failed to update quota');
        }

        return data;
    },

    async setStorageQuota(userId, storageQuotaMb) {
        const bytes = Math.round(Number(storageQuotaMb || 0) * 1024 * 1024);
        return this.updateUserQuota(userId, bytes);
    },

    async resetUserQuota(userId) {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/reset-quota`, {
            method: 'POST',
            headers,
        });
        const data = await safeParseJson(response);

        if (!response.ok) {
            throw new Error(data.error?.message || data._raw || 'Failed to reset quota');
        }

        return data;
    },

    async resetStorageQuota(userId) {
        return this.resetUserQuota(userId);
    },

    async getUserRepos(userId) {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/repos`, { method: 'GET', headers });
        const data = await safeParseJson(response);

        if (!response.ok) {
            throw new Error(data.error?.message || data._raw || 'Failed to fetch user repositories');
        }

        // repo drill-down stays lazy so the users page does not try to load every repo at once
        return {
            environmentKey: data.environment_key || null,
            repos: (data.repos || []).map((repo) => ({
                id: repo.id,
                name: repo.name || 'Untitled',
                gitUrl: repo.git_url || '',
                sizeBytes: Number(repo.size_bytes) || 0,
                sizeLabel: `${((Number(repo.size_bytes) || 0) / (1024 ** 2)).toFixed(1)} MB`,
                createdAt: repo.created_at || null,
                lastActivityAt: repo.last_activity_at || null,
                hasReviewRequest: Boolean(repo.has_review_request),
                reviewRequestedAt: repo.review_requested_at || null,
                reviewDetail: repo.review_detail || '',
            })),
        };
    },

    async getRepoFiles(repoId) {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/admin/repos/${repoId}/files`, { method: 'GET', headers });
        const data = await safeParseJson(response);

        if (!response.ok) {
            throw new Error(data.error?.message || data._raw || 'Failed to fetch repository files');
        }

        return {
            environmentKey: data.environment_key || null,
            files: (data.files || []).map((file) => ({
                id: file.id,
                name: file.name || 'unknown-file',
                path: file.path || '',
                sizeBytes: Number(file.size_bytes) || 0,
                sizeLabel: `${((Number(file.size_bytes) || 0) / (1024 ** 2)).toFixed(1)} MB`,
                status: file.status || 'synced',
                uploadedAt: file.uploaded_at || null,
                mimeType: file.mime_type || null,
            })),
        };
    },

    async inspectRepo(repoId) {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/admin/repos/${repoId}/inspect`, { method: 'GET', headers });
        const data = await safeParseJson(response);

        if (!response.ok && isMissingRoute(response, data)) {
            // degrades cleanly when the preview backend is missing the newer inspect route
            return {
                environmentKey: null,
                repo: null,
                branches: [],
                commits: [],
                files: [],
                unavailableReason: 'Live repository inspect is not deployed for this environment yet.',
            };
        }

        if (!response.ok) {
            throw new Error(data.error?.message || data._raw || 'Failed to inspect repository');
        }

        return {
            environmentKey: data.environment_key || null,
            repo: data.repo ? {
                id: data.repo.id,
                name: data.repo.name,
                gitUrl: data.repo.git_url || '',
            } : null,
            branches: data.branches || [],
            commits: data.commits || [],
            files: (data.files || []).map((file) => ({
                mode: file.mode || '',
                type: file.type || '',
                objectId: file.object_id || '',
                path: file.path || '',
                sizeBytes: Number(file.size_bytes) || 0,
                sizeLabel: `${((Number(file.size_bytes) || 0) / (1024 ** 2)).toFixed(1)} MB`,
            })),
            unavailableReason: '',
        };
    },

    async downloadRepoFile(repoId, filePath) {
        const session = await authService.getSession();
        if (!session?.access_token) {
            throw new Error('Not authenticated');
        }

        const response = await fetch(
            `${API_BASE_URL}/admin/repos/${repoId}/files/download?path=${encodeURIComponent(filePath)}`,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                },
            }
        );

        if (!response.ok) {
            const data = await safeParseJson(response);
            throw new Error(data.error?.message || data._raw || 'Failed to download file');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filePath.split('/').pop() || filePath.split('\\').pop() || 'download.bin';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);
    },

    async getNodes() {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/admin/nodes`, { method: 'GET', headers });
        const data = await safeParseJson(response);

        if (!response.ok) {
            throw new Error(data.error?.message || data._raw || 'Failed to fetch node telemetry');
        }

        if (Array.isArray(data?.nodes) && data.nodes.length > 0) {
            return data.nodes.map(normalizeNodeTelemetry);
        }

        // falls back to mock nodes only when real node_health data is not there yet
        const mock = await mockService.getClusterStatus();
        return (mock.nodes || []).map(normalizeNodeTelemetry);
    },
};

export default adminService;
