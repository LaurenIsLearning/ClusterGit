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
};

export default projectService;
