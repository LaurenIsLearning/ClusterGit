import { authService } from './authService';

//ensure that final base always ends with /api
const rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
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
        // Placeholder for future implementation
        // This would fetch files tracked by git-annex
        return [];
    },

    async uploadFile(projectId, file, onProgress) {
        const session = await authService.getSession();
        if (!session?.access_token) {
            throw new Error('Not authenticated');
        }

        const formData = new FormData();
        formData.append('file', file);

        return uploadWithXhr(`${API_BASE_URL}/repos/${projectId}/upload`, session.access_token, formData, onProgress);
    },
};

export default projectService;
