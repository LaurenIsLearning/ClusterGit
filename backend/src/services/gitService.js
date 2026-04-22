import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { pathToFileURL } from 'url';
import { REPO_BASE_PATH, GIT_LFS_CONFIG } from '../config/config.js';

const execAsync = promisify(execFile);
const GIT_BIN = process.platform === 'win32' ? 'git' : '/usr/bin/git';

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
    return path.join(REPO_BASE_PATH, userId, projectName);
}

async function pathExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

// Returns the .git directory for both bare repos (the path itself) and
// non-bare repos (path/.git), so --git-dir works with either layout.
async function getGitDir(repoPath) {
    const dotGit = path.join(repoPath, '.git');
    return (await pathExists(dotGit)) ? dotGit : repoPath;
}

export async function resolveExistingRepoPath(userId, projectName) {
    const repoDirName = `${projectName}.git`;
    const configured = getRepoPath(userId, projectName);
    // tries legacy bare-repo paths (.git suffix) and old local repo paths so existing repos keep working
    const candidates = [
        configured,
        path.join(path.dirname(configured), repoDirName),
        path.resolve(process.cwd(), 'local-repos', userId, repoDirName),
        path.resolve(process.cwd(), 'clustergit-repos', userId, repoDirName),
        path.resolve(process.cwd(), 'backend', 'local-repos', userId, repoDirName),
        path.resolve(process.cwd(), 'backend', 'clustergit-repos', userId, repoDirName),
    ];

    for (const candidate of candidates) {
        if (await pathExists(candidate)) {
            // Always reinstall the hook so repos created before the fix get the
            // safe update-ref version instead of the old git-annex-sync version.
            await installPostReceiveHook(candidate).catch(() => {});
            return candidate;
        }
    }

    return configured;
}

async function refExists(cwd, refName) {
    try {
        await execAsync(GIT_BIN, ["rev-parse", "--verify", refName], { cwd });
        return true;
    } catch {
        return false;
    }
}

async function syncRemoteBranches(cwd) {
    // refreshes the remote refs before uploads or deletes
    await execAsync(GIT_BIN, ["fetch", "origin", "main"], { cwd });
}

// Removed mergeRemoteGitAnnex as LFS doesn't need a separate metadata branch

// Removed pushGitAnnexBranch

async function prepareWorkingClone(bareRepoPath, tempWorkingPath) {
    // creates the temp working copy used for uploads and delete operations
    await fs.mkdir(tempWorkingPath, { recursive: true });
    await execAsync(GIT_BIN, ["clone", bareRepoPath, "."], { cwd: tempWorkingPath });
    await syncRemoteBranches(tempWorkingPath);
    await execAsync(GIT_BIN, ["checkout", "-B", "main", "origin/main"], { cwd: tempWorkingPath });

    // Git LFS handles its own refs, nothing extra needed here.

    await execAsync(GIT_BIN, ["config", "user.name", "ClusterGit"], { cwd: tempWorkingPath });
    await execAsync(GIT_BIN, ["config", "user.email", "system@clustergit.local"], { cwd: tempWorkingPath });

    const gitDir = await getGitDir(bareRepoPath);
    await execAsync(GIT_BIN, ["--git-dir", gitDir, "config", "user.name", "ClusterGit"]);
    await execAsync(GIT_BIN, ["--git-dir", gitDir, "config", "user.email", "system@clustergit.local"]);
}

// clone the repo read-only into a temp dir so admin inspection can look at real git state.
async function prepareReadOnlyClone(bareRepoPath, tempWorkingPath) {
    await fs.mkdir(tempWorkingPath, { recursive: true });
    await execAsync(GIT_BIN, ["clone", bareRepoPath, "."], { cwd: tempWorkingPath });
    await syncRemoteBranches(tempWorkingPath);
    await execAsync(GIT_BIN, ["checkout", "-B", "main", "origin/main"], { cwd: tempWorkingPath });
}


/**
 * Get Git clone URL
 */
export function getGitUrl(userId, projectName) {
    const host = process.env.GIT_HTTP_HOST || 'develop.clustergit.com';
    return `https://${host}/git/${userId}/${projectName}.git`;
}

/**
 * Check if Git LFS is initialized in a repository
 */
export async function isLfsInitialized(repoPath) {
    try {
        const gitDir = await getGitDir(repoPath);
        await execAsync(GIT_BIN, ["--git-dir", gitDir, "lfs", "ls-files"]);
        return true;
    } catch {
        return false;
    }
}

/**
 * Create a Git repository as a plain project folder
 */
/**
 * Install (or overwrite) the post-receive hook in a repo.
 * The hook runs `git annex sync --no-push --no-pull` after every push so that
 * synced/main is automatically merged into main without needing to contact any
 * remote.  Safe to call on existing repos — just overwrites the hook file.
 */
export async function installPostReceiveHook(repoPath) {
    // Standard post-receive hook is not strictly needed for LFS to work,
    // but we can keep it if we want to auto-update a dashboard or something.
    // For now, let's keep it minimal.
}

export async function createRepository(userId, projectName, description = '') {
    const repoPath = getRepoPath(userId, projectName);
    await fs.mkdir(path.dirname(repoPath), { recursive: true });
    await fs.mkdir(repoPath);

    // 1. init non-bare repo directly in the project folder
    await execAsync(GIT_BIN, ["init"], { cwd: repoPath });
    await execAsync(GIT_BIN, ["symbolic-ref", "HEAD", "refs/heads/main"], { cwd: repoPath });

    // allow temp clones to push back into this non-bare repo
    await execAsync(GIT_BIN, ["config", "receive.denyCurrentBranch", "updateInstead"], { cwd: repoPath });

    // 2. identity
    await execAsync(GIT_BIN, ["config", "user.name", "ClusterGit"], { cwd: repoPath });
    await execAsync(GIT_BIN, ["config", "user.email", "system@clustergit.local"], { cwd: repoPath });

    // 3. README commit
    await fs.writeFile(path.join(repoPath, "README.md"), "# ClusterGit Repository\n");
    await execAsync(GIT_BIN, ["add", "."], { cwd: repoPath });
    await execAsync(GIT_BIN, ["commit", "-m", "Initial commit"], { cwd: repoPath });

    // 4. git-lfs init
    await execAsync(GIT_BIN, ["lfs", "install"], { cwd: repoPath });

    // 5. post-receive hook (optional for now)
    await installPostReceiveHook(repoPath);

    if (description) {
        await fs.writeFile(path.join(repoPath, '.git', 'description'), description);
    }

    return { repoPath, userId };
}


/**
 * Initialize git-annex in a repository (if needed later)
 */
/**
 * Initialize Git LFS in a repository
 */
export async function initGitLfs(repoPath) {
    try {
        console.log("Running initGitLfs in:", repoPath);
        await execAsync(GIT_BIN, ["lfs", "install"], { cwd: repoPath });
        console.log("initGitLfs complete");
        return { success: true };
    } catch (error) {
        throw new Error(`Failed to initialize Git LFS: ${error.message}`);
    }
}

/**
 * Create a project (wrapper)
 */
export async function createProject(userId, projectName, description = '') {
    const { repoPath } = await createRepository(userId, projectName, description);

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
        ownerId: userId
    };
}

/**
 * Add file to a project using git-annex
 */
export async function addFileToProject(userId, projectName, filePath, originalName) {
    const bareRepoPath = await resolveExistingRepoPath(userId, projectName);
    const tempWorkingPath = path.join(os.tmpdir(), `clustergit-upload-${Date.now()}`);

    try {
        if (!(await pathExists(bareRepoPath))) {
            throw new Error(
                `Repository storage is missing for ${projectName}. Metadata exists, but ${bareRepoPath} was not found in this environment`
            );
        }

        await prepareWorkingClone(bareRepoPath, tempWorkingPath);

        const targetPath = path.join(tempWorkingPath, originalName);
        await fs.rename(filePath, targetPath);

        // Ensure this file type is tracked by LFS if it's large
        const stats = await fs.stat(targetPath);
        if (stats.size > GIT_LFS_CONFIG.largeFileThreshold) {
            const ext = path.extname(originalName);
            const pattern = ext ? `*${ext}` : originalName;
            await execAsync(GIT_BIN, ["lfs", "track", pattern], { cwd: tempWorkingPath });
            await execAsync(GIT_BIN, ["add", ".gitattributes"], { cwd: tempWorkingPath });
        }

        await execAsync(GIT_BIN, ["add", originalName], { cwd: tempWorkingPath });

        // commit only if something changed
        const { stdout: statusOut } = await execAsync(GIT_BIN, ["status", "--porcelain"], { cwd: tempWorkingPath });
        if (statusOut.trim()) {
            await execAsync(GIT_BIN, ["commit", "-m", `Upload ${originalName}`], { cwd: tempWorkingPath });
        } else {
            await execAsync(GIT_BIN, ["commit", "--allow-empty", "-m", `Re-upload ${originalName}`], { cwd: tempWorkingPath });
        }
        
        const { stdout: toRefStdout } = await execAsync(GIT_BIN, ["rev-parse", "HEAD"], { cwd: tempWorkingPath });
        const toRef = toRefStdout.trim();

        await execAsync(GIT_BIN, ["push", "origin", "main"], { cwd: tempWorkingPath });

        return {
            success: true,
            name: originalName,
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

export async function deleteFileFromProject(userId, projectName, filePath) {
    const bareRepoPath = await resolveExistingRepoPath(userId, projectName);
    const tempWorkingPath = path.join(os.tmpdir(), `clustergit-delete-${Date.now()}`);

    try {
        if (!(await pathExists(bareRepoPath))) {
            throw new Error(
                `Repository storage is missing for ${projectName}. Metadata exists, but ${bareRepoPath} was not found in this environment`
            );
        }

        await prepareWorkingClone(bareRepoPath, tempWorkingPath);

        const targetPath = path.join(tempWorkingPath, filePath);
        if (!(await pathExists(targetPath))) {
            throw new Error(`File ${filePath} was not found in repository ${projectName}`);
        }

        await execAsync(GIT_BIN, ["rm", filePath], { cwd: tempWorkingPath });
        await execAsync(GIT_BIN, ["commit", "-m", `Delete ${filePath}`], { cwd: tempWorkingPath });

        const { stdout: commitStdout } = await execAsync(GIT_BIN, ["rev-parse", "HEAD"], { cwd: tempWorkingPath });
        const gitCommitHash = commitStdout.trim();

        await execAsync(GIT_BIN, ["push", "origin", "main"], { cwd: tempWorkingPath });

        return {
            success: true,
            gitCommitHash,
            branch: "main"
        };
    } catch (error) {
        console.error("Delete file failed:", error);
        throw new Error(`Failed to delete file from repository: ${error.message}`);
    } finally {
        try { await fs.rm(tempWorkingPath, { recursive: true, force: true }); } catch { }
    }
}

export async function deleteProjectRepository(userId, projectName) {
    const bareRepoPath = await resolveExistingRepoPath(userId, projectName);

    if (!(await pathExists(bareRepoPath))) {
        throw new Error(
            `Repository storage is missing for ${projectName}. Metadata exists, but ${bareRepoPath} was not found in this environment`
        );
    }

    try {
        await fs.rm(bareRepoPath, { recursive: true, force: true });
        return { success: true, repoPath: bareRepoPath };
    } catch (error) {
        console.error("Delete repository failed:", error);
        throw new Error(`Failed to delete repository storage: ${error.message}`);
    }
}

export async function inspectProjectRepository(userId, projectName) {
    const bareRepoPath = await resolveExistingRepoPath(userId, projectName);
    const tempWorkingPath = path.join(os.tmpdir(), `clustergit-inspect-${Date.now()}`);

    try {
        if (!(await pathExists(bareRepoPath))) {
            throw new Error(
                `Repository storage is missing for ${projectName}. Metadata exists, but ${bareRepoPath} was not found in this environment`
            );
        }

        await prepareReadOnlyClone(bareRepoPath, tempWorkingPath);

        // collects live git info so admins can inspect the real repo instead of just table rows
        const [{ stdout: branchStdout }, { stdout: commitStdout }, { stdout: treeStdout }] = await Promise.all([
            execAsync(GIT_BIN, ["branch", "-a", "--format=%(refname:short)"], { cwd: tempWorkingPath }),
            execAsync(GIT_BIN, ["log", "--pretty=format:%H\t%an\t%ad\t%s", "--date=iso-strict", "-n", "20"], { cwd: tempWorkingPath }),
            execAsync(GIT_BIN, ["ls-tree", "-r", "--long", "HEAD"], { cwd: tempWorkingPath })
        ]);

        const branches = branchStdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        const commits = commitStdout
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => {
                const [hash, author, committedAt, ...messageParts] = line.split("\t");
                return {
                    hash,
                    author,
                    committed_at: committedAt,
                    message: messageParts.join("\t")
                };
            });

        const files = treeStdout
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => {
                const match = line.match(/^(\d+)\s+(\w+)\s+([a-f0-9]+)\s+(\d+|-)\t(.+)$/i);
                if (!match) return null;

                return {
                    mode: match[1],
                    type: match[2],
                    object_id: match[3],
                    size_bytes: match[4] === "-" ? null : Number(match[4]),
                    path: match[5]
                };
            })
            .filter(Boolean);

        return {
            repoPath: bareRepoPath,
            branches,
            commits,
            files
        };
    } finally {
        try { await fs.rm(tempWorkingPath, { recursive: true, force: true }); } catch { }
    }
}

export async function getProjectFileBuffer(userId, projectName, filePath) {
    const bareRepoPath = await resolveExistingRepoPath(userId, projectName);
    const tempWorkingPath = path.join(os.tmpdir(), `clustergit-download-${Date.now()}`);

    try {
        if (!(await pathExists(bareRepoPath))) {
            throw new Error(
                `Repository storage is missing for ${projectName}. Metadata exists, but ${bareRepoPath} was not found in this environment`
            );
        }

        await prepareReadOnlyClone(bareRepoPath, tempWorkingPath);

        // Git LFS: if the file is a pointer, we need to fetch the content.
        // Standard git checkout in a clone with LFS installed should handle this,
        // but since we are cloning from a local bare repo, we might need to manually
        // ensure LFS objects are available or just read them from the storage.
        try {
            await execAsync(GIT_BIN, ["lfs", "pull"], { cwd: tempWorkingPath });
        } catch {
            // Might not be an LFS file
        }

        const targetPath = path.join(tempWorkingPath, filePath);
        if (!(await pathExists(targetPath))) {
            throw new Error(`File ${filePath} was not found in repository ${projectName}`);
        }

        const stats = await fs.stat(targetPath);
        const buffer = await fs.readFile(targetPath);

        return {
            buffer,
            size: stats.size,
            path: targetPath
        };
    } finally {
        try { await fs.rm(tempWorkingPath, { recursive: true, force: true }); } catch { }
    }
}

/**
 * Helpers
 */
export async function getRepoSize(repoPath) {
    // walks the repo directory when we need a filesystem fallback size
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

/**
 * Read the current HEAD state of a repo for metadata sync purposes.
 * Works against both bare and non-bare repos with no temp clone.
 */
export async function readRepoStateForSync(repoPath) {
    const gitDir = await getGitDir(repoPath);

    // Resolve both refs — git-annex push deposits commits on synced/main, not main
    const resolve = async (ref) => {
        try {
            const { stdout } = await execAsync(GIT_BIN, ['--git-dir', gitDir, 'rev-parse', '--verify', ref]);
            return stdout.trim();
        } catch { return null; }
    };

    const mainHash   = await resolve('refs/heads/main');
    const syncedHash = await resolve('refs/heads/synced/main');

    if (!mainHash && !syncedHash) {
        const err = new Error('No main branch found');
        err.name = 'NoBranchError';
        throw err;
    }

    const headHash = mainHash;
    // We strictly use main branch now, no more synced/main

    // Commit metadata — use \x1f (unit separator) to avoid conflicts with names/messages
    const { stdout: logOut } = await execAsync(GIT_BIN, [
        '--git-dir', gitDir, 'log', '-1',
        `--pretty=format:%H\x1f%an\x1f%aI\x1f%s`, headHash
    ]);
    const [commitHash, authorName, timestamp, message] = logOut.trim().split('\x1f');

    // Full recursive file tree
    const { stdout: treeOut } = await execAsync(GIT_BIN, [
        '--git-dir', gitDir, 'ls-tree', '-r', '--long', headHash
    ]);

    const files = [];
    for (const line of treeOut.trim().split('\n').filter(Boolean)) {
        const match = line.match(/^(\d{6}) \w+ ([a-f0-9]+)\s+(\d+|-)\t(.+)$/);
        if (!match) continue;
        const [, mode, blobHash, rawSizeStr, filePath] = match;

        let lfsOid = null;
        let sizeBytes = rawSizeStr === '-' ? 0 : Number(rawSizeStr);

        if (mode === '100644' && sizeBytes < 200) {
            // Potential LFS pointer — read blob content to check
            try {
                const { stdout: blob } = await execAsync(GIT_BIN, [
                    '--git-dir', gitDir, 'cat-file', 'blob', blobHash
                ]);
                if (blob.includes('version https://git-lfs.github.com/spec/v1')) {
                    const oidMatch = blob.match(/oid sha256:([a-f0-9]+)/);
                    const sizeMatch = blob.match(/size (\d+)/);
                    if (oidMatch) lfsOid = oidMatch[1];
                    if (sizeMatch) sizeBytes = Number(sizeMatch[1]);
                }
            } catch {}
        }

        files.push({ path: filePath, name: path.basename(filePath), mode, blobHash, lfsOid, sizeBytes });
    }

    return { commitHash, authorName, timestamp, message, files };
}

export default {
    validateProjectName,
    createRepository,
    initGitLfs,
    isLfsInitialized,
    createProject,
    deleteFileFromProject,
    deleteProjectRepository,
    inspectProjectRepository,
    getProjectFileBuffer,
    resolveExistingRepoPath,
    getRepoPath,
    getRepoSize,
    getGitUrl,
    addFileToProject,
    readRepoStateForSync,
    installPostReceiveHook,
};
