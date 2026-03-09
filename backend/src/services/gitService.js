import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { REPO_BASE_PATH, GIT_ANNEX_CONFIG } from '../config/config.js';

const execAsync = promisify(execFile);

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
 * Get Git clone URL
 */
export function getGitUrl(userId, projectName) {
    const repoPath = getRepoPath(userId, projectName);
    const host = '10.27.12.244'; // adjust if needed
    return `git@${host}:${repoPath}`;
}

/**
 * Get git-annex UUID for a repository
 */
export async function getAnnexUuid(repoPath) {
    try {
        const { stdout } = await execAsync(
            "/usr/bin/git",
            ["--git-dir", repoPath, "config", "--get", "annex.uuid"]
        );
        return stdout.trim() || null;
    } catch (error) {
        console.error("Failed to get git-annex UUID:", error);
        return null;
    }
}

/**
 * Create a bare Git repository
 */
export async function createRepository(userId, projectName, description = '') {
    const validation = validateProjectName(projectName);
    if (!validation.valid) throw new Error(validation.error);

    const repoPath = getRepoPath(userId, projectName);

    try {
        await fs.access(repoPath);
        throw new Error('A project with this name already exists');
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }

    await fs.mkdir(path.dirname(repoPath), { recursive: true });
    await fs.mkdir(repoPath);

    const tempInit = path.join(os.tmpdir(), `clustergit-init-${Date.now()}`);
    await fs.mkdir(tempInit);

    try {
        console.log("Running git init in:", repoPath);

        // 1. Bare repo
        await execAsync("/usr/bin/git", ["init", "--bare"], { cwd: repoPath });
        await execAsync("/usr/bin/git", ["symbolic-ref", "HEAD", "refs/heads/main"], { cwd: repoPath });

        // 2. Temp clone
        await execAsync("/usr/bin/git", ["clone", repoPath, "."], { cwd: tempInit });
        await execAsync("/usr/bin/git", ["checkout", "-B", "main"], { cwd: tempInit });

        // 3. Git identity
        await execAsync("/usr/bin/git", ["config", "user.name", "ClusterGit"], { cwd: tempInit });
        await execAsync("/usr/bin/git", ["config", "user.email", "system@clustergit.local"], { cwd: tempInit });

        // 4. Initial README
        await fs.writeFile(path.join(tempInit, "README.md"), "# ClusterGit Repository\n");
        await execAsync("/usr/bin/git", ["add", "."], { cwd: tempInit });
        await execAsync("/usr/bin/git", ["commit", "-m", "Initial commit"], { cwd: tempInit });

        // 5. Initialize git-annex and commit placeholder
        await execAsync("/usr/bin/git", ["annex", "init"], { cwd: tempInit });
        const annexPlaceholder = path.join(tempInit, ".annex-placeholder");
        await fs.writeFile(annexPlaceholder, "This file anchors the git-annex branch");
        await execAsync("/usr/bin/git", ["add", "."], { cwd: tempInit });
        await execAsync("/usr/bin/git", ["commit", "-m", "Initialize git-annex with placeholder"], { cwd: tempInit });

        // 6. Push branches
        await execAsync("/usr/bin/git", ["push", "origin", "main"], { cwd: tempInit });
        await execAsync("/usr/bin/git", ["push", "origin", "git-annex"], { cwd: tempInit });

        // 7. Verify annex UUID from clone
        const annexUuid = await getAnnexUuid(repoPath);
        console.log("Annex UUID:", annexUuid);

        // 8. Cleanup
        await fs.rm(tempInit, { recursive: true, force: true });

        if (description) {
            const descPath = path.join(repoPath, 'description');
            await fs.writeFile(descPath, description);
        }

        return { repoPath, projectName, userId };

    } catch (error) {
        await fs.rm(repoPath, { recursive: true, force: true });
        throw new Error(`Failed to create repository: ${error.message}`);
    }
}

/**
 * Initialize git-annex in a repository (if needed later)
 */
export async function initGitAnnex(repoPath) {
    try {
        console.log("Running initGitAnnex in:", repoPath);
        await execAsync("/usr/bin/git", ["annex", "init"], { cwd: repoPath });
        await execAsync("/usr/bin/git", ["config", "annex.backends", GIT_ANNEX_CONFIG.backend], { cwd: repoPath });
        await execAsync("/usr/bin/git", ["annex", "numcopies", GIT_ANNEX_CONFIG.numCopies], { cwd: repoPath });
        await execAsync("/usr/bin/git", ["config", "annex.largefiles", `largerthan=${GIT_ANNEX_CONFIG.largeFileThreshold}b`], { cwd: repoPath });
        console.log("initGitAnnex complete");
        return { success: true };
    } catch (error) {
        throw new Error(`Failed to initialize git-annex: ${error.message}`);
    }
}

/**
 * Create a project (wrapper)
 */
export async function createProject(userId, projectName, description = '') {
    // createRepository now returns annexUuid from the working clone
    const { repoPath, annexUuid } = await createRepository(userId, projectName, description);

    // get repo size
    const size = await getRepoSize(repoPath);

    // get git clone URL
    const gitUrl = getGitUrl(userId, projectName);

    return {
        name: projectName,
        description,
        repoPath,
        gitUrl,
        size,
        annexUuid, // comes from createRepository
        ownerId: userId
    };
}

/**
 * Add file to a project using git-annex
 */
export async function addFileToProject(userId, projectName, filePath, originalName) {
    const bareRepoPath = getRepoPath(userId, projectName);
    const tempWorkingPath = path.join(os.tmpdir(), `clustergit-upload-${Date.now()}`);

    try {
        await fs.mkdir(tempWorkingPath, { recursive: true });
        await execAsync("/usr/bin/git", ["clone", bareRepoPath, "."], { cwd: tempWorkingPath });

        try {
            await execAsync("/usr/bin/git", ["checkout", "main"], { cwd: tempWorkingPath });
        } catch {
            await execAsync("/usr/bin/git", ["checkout", "-b", "main"], { cwd: tempWorkingPath });
        }

        await execAsync("/usr/bin/git", ["config", "user.name", "ClusterGit"], { cwd: tempWorkingPath });
        await execAsync("/usr/bin/git", ["config", "user.email", "system@clustergit.local"], { cwd: tempWorkingPath });

        const targetPath = path.join(tempWorkingPath, originalName);
        await fs.rename(filePath, targetPath);

        await execAsync("/usr/bin/git", ["annex", "add", originalName], { cwd: tempWorkingPath });
        await execAsync("/usr/bin/git", ["commit", "-m", `Upload ${originalName}`], { cwd: tempWorkingPath });

        await execAsync("/usr/bin/git", ["push", "origin", "HEAD:main"], { cwd: tempWorkingPath });
        await execAsync("/usr/bin/git", ["push", "origin", "git-annex"], { cwd: tempWorkingPath });

        return { success: true, name: originalName };

    } catch (error) {
        console.error("Upload failed:", error);
        throw new Error(`Failed to add file: ${error.message}`);
    } finally {
        try { await fs.rm(tempWorkingPath, { recursive: true, force: true }); } catch {}
    }
}

/**
 * Helpers
 */
export async function getRepoSize(repoPath) {
    const getDirectorySize = async (targetPath) => {
        const entries = await fs.readdir(targetPath, { withFileTypes: true });
        let total = 0;
        for (const entry of entries) {
            const entryPath = path.join(targetPath, entry.name);
            if (entry.isDirectory()) total += await getDirectorySize(entryPath);
            else if (entry.isFile()) total += (await fs.stat(entryPath)).size;
        }
        return total;
    };
    try { return await getDirectorySize(repoPath); } catch { return 0; }
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
    addFileToProject
};