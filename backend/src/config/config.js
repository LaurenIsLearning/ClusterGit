import path from 'path';
import os from 'os';

// Repository storage configuration
const rawRepoPath = process.env.REPO_BASE_PATH || "/repos"; // path.join(os.homedir(), 'clustergit-repos');    This gets seen as root/clustergit-repos in docker
export const REPO_BASE_PATH = path.isAbsolute(rawRepoPath)
    ? rawRepoPath
    : path.resolve(process.cwd(), rawRepoPath);

// Git LFS configuration
export const GIT_LFS_CONFIG = {
    largeFileThreshold: 1024 * 1024, // 1MB
};

// Server configuration
export const SERVER_HOST = process.env.SERVER_HOST || 'localhost';
export const SERVER_PORT = process.env.PORT || 80;

export default {
    REPO_BASE_PATH,
    GIT_LFS_CONFIG,
    SERVER_HOST,
    SERVER_PORT,
};
