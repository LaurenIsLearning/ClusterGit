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

function bytesToGiB(bytes) {
    return Number(((Number(bytes) || 0) / (1024 ** 3)).toFixed(2));
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

        // keep the environment key with the payload so the ui can show what it is browsing.
        return {
            environmentKey: data.environment_key || null,
            users: (data.users || []).map((user) => ({
                id: user.id,
                name: user.name || 'Unknown',
                email: user.email || '',
                used: bytesToGiB(user.used_bytes),
                quota: bytesToGiB(user.quota_bytes),
                usedBytes: Number(user.used_bytes) || 0,
                quotaBytes: Number(user.quota_bytes) || 0,
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

    async createStudent({ email, password, displayName, storageQuotaBytes }) {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/admin/users`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                email,
                password,
                display_name: displayName,
                storage_quota_bytes: storageQuotaBytes,
            }),
        });
        const data = await safeParseJson(response);

        if (!response.ok) {
            throw new Error(data.error?.message || data._raw || 'Failed to create student');
        }

        return data;
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

    async getUserRepos(userId) {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/repos`, { method: 'GET', headers });
        const data = await safeParseJson(response);

        if (!response.ok) {
            throw new Error(data.error?.message || data._raw || 'Failed to fetch user repositories');
        }

        // repos/files are fetched lazily for the drill-down view.
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
            return data.nodes;
        }

        // Fallback to mock nodes only when telemetry does not exist in Supabase/backend.
        const mock = await mockService.getClusterStatus();
        return mock.nodes;
    },
};

export default adminService;
