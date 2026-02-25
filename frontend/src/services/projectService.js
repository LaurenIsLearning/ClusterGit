import { authService } from './authService';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

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

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || 'Failed to create project');
        }

        return data;
    },

    async getMyProjects() {
        const headers = await getAuthHeaders();

        const response = await fetch(`${API_BASE_URL}/repos/my`, {
            method: 'GET',
            headers,
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || 'Failed to fetch projects');
        }

        return data;
    },

    async getProjectFiles(projectId) {
        // Placeholder for future implementation
        // This would fetch files tracked by git-annex
        return [];
    },

    async recordUploadMetadata(repoId, file) {
        if (!repoId) {
            throw new Error('Missing repository id for metadata recording');
        }

        const headers = await getAuthHeaders();
        const branch = 'main';
        const nowHex = Date.now().toString(16);
        const randomHex = Math.random().toString(16).slice(2).padEnd(32, '0');
        const pseudoCommitHash = `${nowHex}${randomHex}`.slice(0, 40);
        const annexKey = `SHA256E-s${file.size}--${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

        const response = await fetch(`${API_BASE_URL}/commits/${repoId}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                git_commit_hash: pseudoCommitHash,
                message: `Upload ${file.name}`,
                branch,
                is_merge: false,
                annex_key: annexKey,
                size_bytes: file.size,
                storage_backend: 'git-annex',
                from_ref: `refs/heads/${branch}`,
                to_ref: `refs/heads/${branch}`,
                commit_count: 1,
                hook_source: 'ui-upload-sim'
            }),
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error?.message || 'Failed to record upload metadata');
        }

        return data;
    },
};

export default projectService;
