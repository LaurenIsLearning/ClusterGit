import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { REPO_BASE_PATH, GIT_ANNEX_CONFIG } from '../config/config.js';

const execAsync = promisify(exec);

/**
 * Validate project name
 * Only allow alphanumeric characters, hyphens, and underscores
 */
export function validateProjectName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Project name is required' };
    }

    if (name.length < 3) {
        return { valid: false, error: 'Project name must be at least 3 characters' };
    }

    if (name.length > 50) {
        return { valid: false, error: 'Project name must be less than 50 characters' };
    }

    const validPattern = /^[a-zA-Z0-9_-]+$/;
    if (!validPattern.test(name)) {
        return {
            valid: false,
            error: 'Project name can only contain letters, numbers, hyphens, and underscores'
        };
    }

    return { valid: true };
}

/**
 * Get repository path for a user's project
 */
export function getRepoPath(userId, projectName) {
    return path.join(REPO_BASE_PATH, userId, `${projectName}.git`);
}

/**
 * Create a bare Git repository
 */
export async function createRepository(userId, projectName, description = '') {
    const validation = validateProjectName(projectName);
    if (!validation.valid) {
        throw new Error(validation.error);
    }

    const repoPath = getRepoPath(userId, projectName);

    // Check if repository already exists
    try {
        await fs.access(repoPath);
        throw new Error('A project with this name already exists');
    } catch (err) {
        if (err.code !== 'ENOENT') {
            throw err;
        }
    }

    // Create directory structure
    await fs.mkdir(repoPath, { recursive: true });

    try {
        // Initialize bare Git repository
        await execAsync('git init --bare', { cwd: repoPath });

        // Set repository description
        if (description) {
            const descPath = path.join(repoPath, 'description');
            await fs.writeFile(descPath, description);
        }

        return {
            repoPath,
            projectName,
            userId,
        };
    } catch (error) {
        // Clean up on failure
        await fs.rm(repoPath, { recursive: true, force: true });
        throw new Error(`Failed to create repository: ${error.message}`);
    }
}

/**
 * Initialize git-annex in a repository
 */
export async function initGitAnnex(repoPath) {
    try {
        // Initialize git-annex
        await execAsync('git annex init', { cwd: repoPath });

        // Configure git-annex backend
        await execAsync(`git config annex.backends ${GIT_ANNEX_CONFIG.backend}`, {
            cwd: repoPath
        });

        // Set number of copies
        await execAsync(`git annex numcopies ${GIT_ANNEX_CONFIG.numCopies}`, {
            cwd: repoPath
        });

        // Configure large file threshold
        await execAsync(
            `git config annex.largefiles "largerthan=${GIT_ANNEX_CONFIG.largeFileThreshold}b"`,
            { cwd: repoPath }
        );

        return { success: true };
    } catch (error) {
        throw new Error(`Failed to initialize git-annex: ${error.message}`);
    }
}

/**
 * Get git-annex UUID for a repository
 */
export async function getAnnexUuid(repoPath) {
    try {
        const { stdout } = await execAsync('git annex info --json', { cwd: repoPath });
        const info = JSON.parse(stdout);
        // Find the UUID of the current ("here") repository
        const hereRepos = [
            ...(info['semitrusted repositories'] || []),
            ...(info['trusted repositories'] || []),
            ...(info['untrusted repositories'] || [])
        ];
        const localRepo = hereRepos.find(repo => repo.here === true);
        return localRepo ? localRepo.uuid : null;
    } catch (error) {
        console.error('Failed to get git-annex UUID:', error);
        return null;
    }
}

/**
 * Get repository size
 */
export async function getRepoSize(repoPath) {
    try {
        // Use -sk for macOS compatibility (returns size in KB)
        const { stdout } = await execAsync(`du -sk "${repoPath}"`);
        const sizeInKB = parseInt(stdout.split('\t')[0], 10);
        // Convert KB to bytes
        const sizeInBytes = sizeInKB * 1024;
        return sizeInBytes;
    } catch (error) {
        console.error('Failed to get repo size:', error);
        return 0;
    }
}

/**
 * Generate Git clone URL
 */
export function getGitUrl(userId, projectName) {
    const repoPath = getRepoPath(userId, projectName);
    return `file://${repoPath}`;
}

/**
 * Create a complete project with Git and git-annex
 */
export async function createProject(userId, projectName, description = '') {
    // Create the Git repository
    const { repoPath } = await createRepository(userId, projectName, description);

    // Initialize git-annex
    await initGitAnnex(repoPath);

    // Get initial size
    const size = await getRepoSize(repoPath);

    // Get git-annex UUID
    const annexUuid = await getAnnexUuid(repoPath);

    // Generate clone URL
    const gitUrl = getGitUrl(userId, projectName);

    return {
        name: projectName,
        description,
        repoPath,
        gitUrl,
        size,
        annexUuid,
        ownerId: userId,
    };
}

export default {
    validateProjectName,
    createRepository,
    initGitAnnex,
    getAnnexUuid,
    createProject,
    getRepoPath,
    getRepoSize,
    getGitUrl,
};
