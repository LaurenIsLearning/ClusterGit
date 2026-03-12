import { authService } from './authService';
import { getApiBaseUrl } from "../utils/api";

//ensure that final base always ends with /api
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

function parseSizeToBytes(sizeValue) {
    if (typeof sizeValue === 'number') return sizeValue;
    const raw = String(sizeValue || '').trim();
    const match = raw.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)$/i);
    if (!match) return 0;
    const value = Number(match[1]) || 0;
    const unit = match[2].toUpperCase();
    const factors = {
        B: 1,
        KB: 1024,
        MB: 1024 ** 2,
        GB: 1024 ** 3,
        TB: 1024 ** 4,
    };
    return Math.round(value * (factors[unit] || 1));
}

function uploadWithXhr(url, accessToken, formData, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.timeout = 120000;
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && onProgress) {
                const percentComplete = (event.loaded / event.total) * 100;
                onProgress(percentComplete);
            }
        };

        xhr.onload = () => {
            let data;
            try {
                data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
            } catch {
                data = { _raw: xhr.responseText };
            }

            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(data);
            } else {
                reject(new Error(data.error?.message || data._raw || `Upload failed (${xhr.status})`));
            }
        };

        xhr.onerror = () => {
            reject(new Error(`Network error during upload to ${url}`));
        };

        xhr.ontimeout = () => {
            reject(new Error(`Upload timed out after 120s to ${url}`));
        };

        xhr.send(formData);
    });
}

async function getAuthHeaders() {
    const session = await authService.getSession();
    if (!session?.access_token) {
        throw new Error('Not authenticated');
    }

    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
    };
}

export const projectService = {
    async createProject(name, description) {
        const headers = await getAuthHeaders();

        const response = await fetch(`${API_BASE_URL}/repos/create`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ name, description }),
        });

        const data = await safeParseJson(response);

        if (!response.ok) {
            throw new Error(data.error?.message || data._raw || 'Failed to create project');
        }

        return data;
    },

    async getMyProjects() {
        const headers = await getAuthHeaders();

        console.log("API URL:", `${API_BASE_URL}/repos/my`);
        
        const response = await fetch(`${API_BASE_URL}/repos/my`, {
            method: 'GET',
            headers,
        });

        const data = await safeParseJson(response);

        if (!response.ok) {
            throw new Error(data.error?.message || data._raw || 'Failed to fetch projects');
        }

        return data;
    },

    async getProjectFiles(projectId) {
        const headers = await getAuthHeaders();

        let response = await fetch(`${API_BASE_URL}/repos/${projectId}/files`, {
            method: 'GET',
            headers,
        });

        let data = await safeParseJson(response);

        if (!response.ok && isMissingRoute(response, data)) {
            // Backward-compatible fallback for deployments that only expose /commits/:repo_id.
            response = await fetch(`${API_BASE_URL}/commits/${projectId}`, {
                method: 'GET',
                headers,
            });
            data = await safeParseJson(response);
            if (response.ok) {
                const files = (data || [])
                    .filter((commit) => typeof commit.message === 'string' && commit.message.startsWith('Upload '))
                    .map((commit) => ({
                        id: commit.id,
                        name: commit.message.replace(/^Upload\s+/, '').trim() || 'unknown-file',
                        size_bytes: 0,
                        type: 'unknown',
                        status: 'synced',
                        created_at: commit.committed_at || commit.created_at || null,
                    }));
                return files;
            }
        }

        if (!response.ok) {
            throw new Error(data.error?.message || data._raw || 'Failed to fetch project files');
        }

        return data;
    },

    async getDashboardSummary() {
        const headers = await getAuthHeaders();

        let response = await fetch(`${API_BASE_URL}/repos/summary`, {
            method: 'GET',
            headers,
        });

        let data = await safeParseJson(response);

        if (!response.ok && isMissingRoute(response, data)) {
            // Backward-compatible fallback for deployments that don't yet expose /repos/summary.
            const projects = await this.getMyProjects();
            const usedBytes = (projects || []).reduce((sum, project) => {
                return sum + parseSizeToBytes(project.size);
            }, 0);

            return {
                quota: {
                    used: usedBytes,
                    total: 20 * 1024 * 1024 * 1024,
                },
                recent_activity: [],
            };
        }

        if (!response.ok) {
            throw new Error(data.error?.message || data._raw || 'Failed to load dashboard summary');
        }

        return data;
    },

    async uploadFile(projectId, file, onProgress) {
        const session = await authService.getSession();
        if (!session?.access_token) {
            throw new Error('Not authenticated');
        }

        const formData = new FormData();
        formData.append('file', file);

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${API_BASE_URL}/repos/${projectId}/upload`);
            xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable && onProgress) {
                    const percentComplete = (event.loaded / event.total) * 100;
                    onProgress(percentComplete);
                }
            };

            xhr.onload = () => {
                let data;
                try {
                    data = JSON.parse(xhr.responseText);
                } catch (e) {
                    data = { error: { message: 'Invalid server response' } };
                }

                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(data);
                } else {
                    reject(new Error(data.error?.message || 'Upload failed'));
                }
            };

            xhr.onerror = () => {
                reject(new Error('Network error during upload'));
            };

            xhr.send(formData);
        });
    },

    async deleteFile(projectId, fileId) {
        const headers = await getAuthHeaders();

        const response = await fetch(`${API_BASE_URL}/repos/${projectId}/files/${fileId}`, {
            method: 'DELETE',
            headers,
        });

        const data = await safeParseJson(response);
        if (!response.ok) {
            throw new Error(data.error?.message || data._raw || 'Failed to delete file');
        }

        return data;
    },

    async deleteProject(projectId) {
        const headers = await getAuthHeaders();

        const response = await fetch(`${API_BASE_URL}/repos/${projectId}`, {
            method: 'DELETE',
            headers,
        });

        const data = await safeParseJson(response);
        if (!response.ok) {
            throw new Error(data.error?.message || data._raw || 'Failed to delete repository');
        }

        return data;
    },

    async requestReview(projectId) {
        const headers = await getAuthHeaders();

        const response = await fetch(`${API_BASE_URL}/repos/${projectId}/request-review`, {
            method: 'POST',
            headers,
        });

        const data = await safeParseJson(response);
        if (!response.ok) {
            throw new Error(data.error?.message || data._raw || 'Failed to request review');
        }

        return data;
    },
};

export default projectService;
