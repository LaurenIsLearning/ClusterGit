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
 * Create a bare Git repository
 */
export async function createRepository(userId, projectName, description = '') {
    const validation = validateProjectName(projectName);
    if (!validation.valid) {
        throw new Error(validation.error);
    }

    const repoPath = getRepoPath(userId, projectName);

    try {
        await fs.access(repoPath);
        throw new Error('A project with this name already exists');
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }

    await fs.mkdir(path.dirname(repoPath), { recursive: true });
    await fs.mkdir(repoPath);

    try {
        console.log("Running git init in:", repoPath);

        // create bare repo
        await execAsync("/usr/bin/git", ["init", "--bare"], { cwd: repoPath });

        await execAsync("/usr/bin/git", ["symbolic-ref", "HEAD", "refs/heads/main"], { cwd: repoPath });

        console.log("Bare repo created");

        // create temporary working clone
        const tempInit = path.join(os.tmpdir(), `clustergit-init-${Date.now()}`);
        await fs.mkdir(tempInit);

        await execAsync("/usr/bin/git", ["clone", repoPath, "."], { cwd: tempInit });

        // ensure main branch
        await execAsync("/usr/bin/git", ["checkout", "-B", "main"], { cwd: tempInit });

        // configure commit identity
        await execAsync("/usr/bin/git", ["config", "user.name", "ClusterGit"], { cwd: tempInit });
        await execAsync("/usr/bin/git", ["config", "user.email", "system@clustergit.local"], { cwd: tempInit });

        // create README so repo isn't empty
        await fs.writeFile(path.join(tempInit, "README.md"), "# ClusterGit Repository\n");

        // commit initial README
        await execAsync("/usr/bin/git", ["add", "."], { cwd: tempInit });
        await execAsync("/usr/bin/git", ["commit", "-m", "Initial commit"], { cwd: tempInit });
        
        // initialize git-annex in the working clone
        await execAsync("/usr/bin/git", ["annex", "init"], { cwd: tempInit });

        // CREATE A DUMMY FILE TO ANCHOR ANNEX
        const annexPlaceholder = path.join(tempInit, ".annex-placeholder");
        await fs.writeFile(annexPlaceholder, "This file anchors the git-annex branch");

        // add, commit, and push the dummy file
        await execAsync("/usr/bin/git", ["add", "."], { cwd: tempInit });
        await execAsync("/usr/bin/git", ["commit", "-m", "Initialize git-annex with placeholder"], { cwd: tempInit });

        // push main branch and annex branch back to bare repo
        await execAsync("/usr/bin/git", ["push", "origin", "main"], { cwd: tempInit });
        await execAsync("/usr/bin/git", ["push", "origin", "git-annex"], { cwd: tempInit });

        const annexUuid = await getAnnexUuid(repoPath);
        console.log("Annex UUID:", annexUuid);

        // cleanup temp repo
        await fs.rm(tempInit, { recursive: true, force: true });

        console.log("Initial commit pushed");

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
        console.log("Running initGitAnnex in:", repoPath);
        await execAsync("/usr/bin/git", ["annex", "init"], { cwd: repoPath });
        console.log("initGitAnnex complete");

        // Configure git-annex backend
        await execAsync("/usr/bin/git", ["config", "annex.backends", GIT_ANNEX_CONFIG.backend], {
            cwd: repoPath
        });

        // Set number of copies
        await execAsync("/usr/bin/git", ["annex", "numcopies", GIT_ANNEX_CONFIG.numCopies], {
            cwd: repoPath
        });

        // Configure large file threshold
        await execAsync("/usr/bin/git", [
            "config",
            "annex.largefiles",
            `largerthan=${GIT_ANNEX_CONFIG.largeFileThreshold}b`
        ], { cwd: repoPath });

        return { success: true };
    } catch (error) {
        throw new Error(`Failed to initialize git-annex: ${error.message}`);
    }
}

/**
 * Get git-annex UUID for a repository
 * (fixed bc if annexUuid = null broke it, mainly for new repos)
 */
export async function getAnnexUuid(repoPath) {
    try {
        const { stdout } = await execAsync(
            "/usr/bin/git",
            ["config", "--get", "annex.uuid"],
            { cwd: repoPath }
        );

        return stdout.trim() || null;

    } catch (error) {
        console.error("Failed to get git-annex UUID:", error);
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
    const bareRepoPath = getRepoPath(userId, projectName);
    const tempWorkingPath = path.join(os.tmpdir(), `clustergit-upload-${Date.now()}`);

    try {
        // 1. Create temporary directory
        await fs.mkdir(tempWorkingPath, { recursive: true });

        // 2. Clone the bare repository (as a non-bare clone)
        await execAsync("/usr/bin/git", ["clone", bareRepoPath, "."], { cwd: tempWorkingPath });
        console.log("Cloning repo:", bareRepoPath);

        // ensure main branch exists
        try {
            await execAsync("/usr/bin/git", ["checkout", "main"], { cwd: tempWorkingPath });
        } catch {
            await execAsync("/usr/bin/git", ["checkout", "-b", "main"], { cwd: tempWorkingPath });
        }

        //keeps main up to date
        await execAsync("/usr/bin/git", ["pull", "origin", "main"], { cwd: tempWorkingPath }).catch(()=>{});

        // Configure git identity for commits
        await execAsync("/usr/bin/git", ["config", "user.name", "ClusterGit"], { cwd: tempWorkingPath });
        await execAsync("/usr/bin/git", ["config", "user.email", "system@clustergit.local"], { cwd: tempWorkingPath });

        // 3. Initialize git-annex in the temporary clone
        // We need to do this because git-annex needs to be aware of the new location
        //await execAsync("/usr/bin/git", ["annex", "init", "upload-tmp"], { cwd: tempWorkingPath });

        // 4. Move the uploaded file to the clone
        const targetPath = path.join(tempWorkingPath, originalName);
        await fs.rename(filePath, targetPath);
        const fileStats = await fs.stat(targetPath);

        // Resolve branch and prior ref for push metadata
        let branch = "main";
        try {
            const { stdout } = await execAsync("/usr/bin/git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: tempWorkingPath });
            branch = stdout.trim() || "main";
        } catch (_) {
            // Keep default branch fallback.
        }

        let fromRef = null;
        try {
            const { stdout } = await execAsync("/usr/bin/git", ["rev-parse", "HEAD"], { cwd: tempWorkingPath });
            fromRef = stdout.trim();
        } catch (_) {
            // Repository may not have an initial commit yet.
        }

        // 5. Add file to git-annex
        await execAsync("/usr/bin/git", ["annex", "add", originalName], {
            cwd: tempWorkingPath
        });

        // Get annex key for the file
        const { stdout: annexKeyStdout } = await execAsync(
            "/usr/bin/git",
            ["annex", "lookupkey", originalName],
            { cwd: tempWorkingPath }
        );

        const annexKey = annexKeyStdout.trim() || null;

        // 6. Commit the changes
        // Using -m "Upload file" for now. In the future, we could pass a message.
        await execAsync("/usr/bin/git", ["commit", "-m", `Upload ${originalName}`], { cwd: tempWorkingPath });
        const { stdout: toRefStdout } = await execAsync(
            "/usr/bin/git",
            ["rev-parse", "HEAD"],
            { cwd: tempWorkingPath }
        );
        const toRef = toRefStdout.trim();

        // 7. Push back to the bare repository
        console.log("Pushing to repo:", bareRepoPath);
        console.log("Temp repo contents:", await fs.readdir(tempWorkingPath));
        await execAsync("/usr/bin/git", ["push", "--force-with-lease", "origin", "HEAD:main"], { cwd: tempWorkingPath });

        // 8. Push git-annex metadata
        await execAsync("/usr/bin/git", ["push", "origin", "git-annex"], { cwd: tempWorkingPath });

        return {
            success: true,
            name: originalName,
            size: fileStats.size,
            branch,
            annexKey,
            gitCommitHash: toRef,
            fromRef,
            toRef,
            commitCount: 1
        };
    } catch (error) {
        console.error('Failed to add file to repository:', error);
        throw new Error(`Failed to add file to repository: ${error.message}`);
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
    getRepoPath,
    getRepoSize,
    getGitUrl,
    addFileToProject,
};
