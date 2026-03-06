import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { pathToFileURL } from 'url';
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

async function pathExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

export async function resolveExistingRepoPath(userId, projectName) {
    const repoDirName = `${projectName}.git`;
    const configured = getRepoPath(userId, projectName);

    const candidates = [
        configured,
        path.resolve(process.cwd(), 'local-repos', userId, repoDirName),
        path.resolve(process.cwd(), 'clustergit-repos', userId, repoDirName),
        path.resolve(process.cwd(), 'backend', 'local-repos', userId, repoDirName),
        path.resolve(process.cwd(), 'backend', 'clustergit-repos', userId, repoDirName),
    ];

    for (const candidate of candidates) {
        if (await pathExists(candidate)) {
            return candidate;
        }
    }

    return configured;
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
        const getDirectorySize = async (targetPath) => {
            const entries = await fs.readdir(targetPath, { withFileTypes: true });
            let total = 0;

            for (const entry of entries) {
                const entryPath = path.join(targetPath, entry.name);
                if (entry.isDirectory()) {
                    total += await getDirectorySize(entryPath);
                } else if (entry.isFile()) {
                    const stats = await fs.stat(entryPath);
                    total += stats.size;
                }
            }

            return total;
        };

        return await getDirectorySize(repoPath);
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
    // Use the specific IP requested by the user for SSH clones
    const host = '10.27.12.244';
    return `git@${host}:${repoPath}`;
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

/**
 * Add a file to a project's repository
 */
export async function addFileToProject(userId, projectName, filePath, originalName) {
    const bareRepoPath = await resolveExistingRepoPath(userId, projectName);
    const tempWorkingPath = path.join(os.tmpdir(), `clustergit-upload-${Date.now()}`);

    try {
        // 1. Create temporary directory
        await fs.mkdir(tempWorkingPath, { recursive: true });

        // 2. Clone the bare repository (as a non-bare clone)
        const cloneSource = pathToFileURL(bareRepoPath).href;
        await execAsync(`git clone "${cloneSource}" .`, { cwd: tempWorkingPath });

        // 3. Initialize git-annex in the temporary clone
        // We need to do this because git-annex needs to be aware of the new location
        await execAsync('git annex init "upload-tmp"', { cwd: tempWorkingPath });

        // 4. Move the uploaded file to the clone
        const targetPath = path.join(tempWorkingPath, originalName);
        await fs.rename(filePath, targetPath);
        const fileStats = await fs.stat(targetPath);

        // Ensure commit identity exists in temp clones regardless of host git config.
        await execAsync('git config user.name "ClusterGit Upload Bot"', { cwd: tempWorkingPath });
        await execAsync('git config user.email "upload-bot@clustergit.local"', { cwd: tempWorkingPath });

        // Resolve branch and prior ref for push metadata
        let branch = "main";
        try {
            const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: tempWorkingPath });
            branch = stdout.trim() || "main";
        } catch (_) {
            // Keep default branch fallback.
        }

        // git-annex can move HEAD to adjusted/<branch>(unlocked). Pushes must target canonical branch names.
        const adjustedMatch = /^adjusted\/(.+)\(unlocked\)$/.exec(branch);
        const pushBranch = adjustedMatch ? adjustedMatch[1] : branch;

        let fromRef = null;
        try {
            const { stdout } = await execAsync('git rev-parse HEAD', { cwd: tempWorkingPath });
            fromRef = stdout.trim();
        } catch (_) {
            // Repository may not have an initial commit yet.
        }

        // 5. Add file to git-annex
        await execAsync(`git annex add "${originalName}"`, { cwd: tempWorkingPath });
        const { stdout: annexKeyStdout } = await execAsync(`git annex lookupkey "${originalName}"`, { cwd: tempWorkingPath });
        const annexKey = annexKeyStdout.trim() || null;

        // 6. Commit changes if there is anything staged/modified.
        // Re-uploads of identical content can legitimately produce no-op state.
        const { stdout: statusStdout } = await execAsync('git status --porcelain', { cwd: tempWorkingPath });
        const hasChanges = Boolean(statusStdout.trim());

        let toRef = fromRef;
        let commitCount = 0;
        if (hasChanges) {
            try {
                await execAsync(`git commit -m "Upload ${originalName}"`, { cwd: tempWorkingPath });
            } catch (commitError) {
                const details = [
                    commitError.message || '',
                    commitError.stderr || '',
                    commitError.stdout || ''
                ].filter(Boolean).join('\n').trim();
                throw new Error(`git commit failed: ${details}`);
            }
            const { stdout: toRefStdout } = await execAsync('git rev-parse HEAD', { cwd: tempWorkingPath });
            toRef = toRefStdout.trim();
            commitCount = 1;
        }

        // 7. Reconcile with remote branch (if it exists) and push canonical branch
        await execAsync('git fetch origin', { cwd: tempWorkingPath });
        const { stdout: remoteHeadRef } = await execAsync(`git ls-remote --heads origin "${pushBranch}"`, {
            cwd: tempWorkingPath
        });
        if (remoteHeadRef.trim()) {
            try {
                await execAsync(`git rebase origin/${pushBranch}`, { cwd: tempWorkingPath });
            } catch (rebaseError) {
                // Ensure the temp clone is left in a clean state before failing.
                try {
                    await execAsync('git rebase --abort', { cwd: tempWorkingPath });
                } catch (_) {
                    // Ignore if there is nothing to abort.
                }
                throw rebaseError;
            }
        }
        if (hasChanges) {
            await execAsync(`git push origin HEAD:${pushBranch}`, { cwd: tempWorkingPath });
        }

        // 8. Push git-annex metadata
        await execAsync('git push origin git-annex', { cwd: tempWorkingPath });

        return {
            success: true,
            name: originalName,
            size: fileStats.size,
            branch: pushBranch,
            annexKey,
            gitCommitHash: toRef,
            fromRef,
            toRef,
            commitCount
        };
    } catch (error) {
        console.error('Failed to add file to repository:', error);
        const details = [
            error.message || '',
            error.stderr || '',
            error.stdout || ''
        ].filter(Boolean).join('\n').trim();
        throw new Error(`Failed to add file to repository: ${details}`);
    } finally {
        // 9. Clean up temporary working directory
        try {
            await fs.rm(tempWorkingPath, { recursive: true, force: true });
        } catch (cleanupError) {
            console.error('Failed to cleanup temporary upload path:', cleanupError);
        }
    }
}

export default {
    validateProjectName,
    createRepository,
    initGitAnnex,
    getAnnexUuid,
    createProject,
    resolveExistingRepoPath,
    getRepoPath,
    getRepoSize,
    getGitUrl,
    addFileToProject,
};
