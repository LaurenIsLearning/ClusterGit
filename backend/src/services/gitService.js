import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { supabase } from '../utils/supabase.js';
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
export async function getGitUrl(userId, projectName, requestedHost = null, protocol = 'http') {
    // Resolve email prefix for professional URL
    let username = userId; // fallback to UUID
    try {
        const { data, error } = await supabase.auth.admin.getUserById(userId);
        if (!error && data?.user?.email) {
            username = data.user.email.split('@')[0];
        }
    } catch (err) {
        console.warn(`Could not resolve username for ${userId}, falling back to UUID in URL`);
    }

    // Determine host prefix dynamically or from env
    let hostPrefix;
    if (requestedHost) {
        hostPrefix = `${protocol}://${requestedHost}`;
    } else {
        const host = process.env.SERVER_HOST || 'localhost';
        const port = process.env.PORT || 8080;
        hostPrefix = host === 'localhost' ? `http://${host}:${port}` : `https://${host}`;
    }

    return `${hostPrefix}/${username}/${projectName}.git`;
}

/**
 * Get git-annex UUID for a repository
 */
export async function getAnnexUuid(repoPath) {
    try {
        // Detect if it's a working copy (has .git subdir) or bare repo
        const gitDir = (await fs.stat(path.join(repoPath, '.git')).catch(() => null))
            ? path.join(repoPath, '.git')
            : repoPath;

        const { stdout } = await execAsync(
            "/usr/bin/git",
            ["--git-dir", gitDir, "config", "--get", "annex.uuid"]
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
    const repoPath = getRepoPath(userId, projectName);
    await fs.mkdir(path.dirname(repoPath), { recursive: true });
    await fs.mkdir(repoPath);

    const tempInit = path.join(os.tmpdir(), `clustergit-init-${Date.now()}`);
    await fs.mkdir(tempInit);

    // 1. init bare
    await execAsync("/usr/bin/git", ["init", "--bare"], { cwd: repoPath });
    await execAsync("/usr/bin/git", ["symbolic-ref", "HEAD", "refs/heads/main"], { cwd: repoPath });

    // 2. clone to temp working copy
    await execAsync("/usr/bin/git", ["clone", repoPath, "."], { cwd: tempInit });
    await execAsync("/usr/bin/git", ["checkout", "-B", "main"], { cwd: tempInit });

    // 3. identity
    await execAsync("/usr/bin/git", ["config", "user.name", "ClusterGit"], { cwd: tempInit });
    await execAsync("/usr/bin/git", ["config", "user.email", "system@clustergit.local"], { cwd: tempInit });

    // 4. README commit
    await fs.writeFile(path.join(tempInit, "README.md"), "# ClusterGit Repository\n");
    await execAsync("/usr/bin/git", ["add", "."], { cwd: tempInit });
    await execAsync("/usr/bin/git", ["commit", "-m", "Initial commit"], { cwd: tempInit });

    // 5. git-annex init + placeholder
    await execAsync("/usr/bin/git", ["annex", "init"], { cwd: tempInit });
    const annexPlaceholder = path.join(tempInit, ".annex-placeholder");
    await fs.writeFile(annexPlaceholder, "This file anchors the git-annex branch");
    await execAsync("/usr/bin/git", ["add", "."], { cwd: tempInit });
    await execAsync("/usr/bin/git", ["commit", "-m", "Initialize git-annex with placeholder"], { cwd: tempInit });

    // 6. push branches back to bare
    await execAsync("/usr/bin/git", ["push", "origin", "main"], { cwd: tempInit });
    await execAsync("/usr/bin/git", ["push", "origin", "git-annex"], { cwd: tempInit });

    // 7. get annex UUID from working clone (not bare)
    const annexUuid = await getAnnexUuid(tempInit);

    // 8. cleanup
    await fs.rm(tempInit, { recursive: true, force: true });

    if (description) {
        await fs.writeFile(path.join(repoPath, 'description'), description);
    }

    return { repoPath, userId, annexUuid };
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
export async function createProject(userId, projectName, description = '', requestedHost = null, protocol = 'http') {
    // createRepository now returns annexUuid from the working clone
    const { repoPath, annexUuid } = await createRepository(userId, projectName, description);

    // get repo size
    const size = await getRepoSize(repoPath);

    // get git clone URL
    const gitUrl = await getGitUrl(userId, projectName, requestedHost, protocol);

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
        await execAsync("/usr/bin/git", ["checkout", "-B", "main"], { cwd: tempWorkingPath });

        //set identity for git
        await execAsync("/usr/bin/git", ["config", "user.name", "ClusterGit"], { cwd: tempWorkingPath });
        await execAsync("/usr/bin/git", ["config", "user.email", "system@clustergit.local"], { cwd: tempWorkingPath });

        // also set identity on bare repo for git-annex copy operations
        await execAsync("/usr/bin/git", ["--git-dir", bareRepoPath, "config", "user.name", "ClusterGit"]);
        await execAsync("/usr/bin/git", ["--git-dir", bareRepoPath, "config", "user.email", "system@clustergit.local"]);

        const targetPath = path.join(tempWorkingPath, originalName);
        await fs.rename(filePath, targetPath);

        // unlock file if it already exists in annex (allows overwrite)
        try {
            await execAsync("/usr/bin/git", ["annex", "unlock", originalName], { cwd: tempWorkingPath });
        } catch { }

        await execAsync("/usr/bin/git", ["annex", "add", originalName], { cwd: tempWorkingPath });

        const { stdout: annexKeyStdout } = await execAsync(
            "/usr/bin/git",
            ["annex", "lookupkey", originalName],
            { cwd: tempWorkingPath }
        );
        const annexKey = annexKeyStdout.trim() || null;

        // commit only if something changed
        const { stdout: statusOut } = await execAsync("/usr/bin/git", ["status", "--porcelain"], { cwd: tempWorkingPath });
        if (statusOut.trim()) {
            await execAsync("/usr/bin/git", ["commit", "-m", `Upload ${originalName}`], { cwd: tempWorkingPath });
        } else {
            // force a new commit even if content is identical, so metadata stays consistent
            await execAsync("/usr/bin/git", ["commit", "--allow-empty", "-m", `Re-upload ${originalName}`], { cwd: tempWorkingPath });
        }
        const { stdout: toRefStdout } = await execAsync("/usr/bin/git", ["rev-parse", "HEAD"], { cwd: tempWorkingPath });
        const toRef = toRefStdout.trim();

        await execAsync("/usr/bin/git", ["push", "origin", "main"], { cwd: tempWorkingPath });
        await execAsync("/usr/bin/git", ["push", "origin", "git-annex"], { cwd: tempWorkingPath });

        // copy actual annex content to bare repo
        await execAsync("/usr/bin/git", ["annex", "copy", "--to", "origin", originalName], { cwd: tempWorkingPath });


        return {
            success: true,
            name: originalName,
            annexKey,
            gitCommitHash: toRef,
            branch: "main"
        };
    } catch (err) {
        console.error("Upload failed:", err);
        throw new Error(`Failed to add file to repository: ${err.message}`);
    } finally {
        try { await fs.rm(tempWorkingPath, { recursive: true, force: true }); } catch { }
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