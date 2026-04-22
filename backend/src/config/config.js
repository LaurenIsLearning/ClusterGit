import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Repository storage configuration
const configuredRepoPath = process.env.REPO_BASE_PATH?.trim();
const mountedRepoPath = "/repos";
const rawRepoPath =
    process.env.KUBERNETES_SERVICE_HOST && fs.existsSync(mountedRepoPath)
        ? mountedRepoPath
        : configuredRepoPath || "./local-repos";

export const REPO_BASE_PATH = path.isAbsolute(rawRepoPath)
    ? rawRepoPath
    : path.resolve(process.cwd(), rawRepoPath);

// Git-annex configuration
export const GIT_ANNEX_CONFIG = {
    backend: 'SHA256E', // Cryptographic hash + extension
    largeFileThreshold: 1024 * 1024, // 1MB
    numCopies: 1, // Minimum number of copies
};

// Server configuration
export const SERVER_HOST = process.env.SERVER_HOST || 'localhost';
export const SERVER_PORT = process.env.PORT || 80;

export default {
    REPO_BASE_PATH,
    GIT_ANNEX_CONFIG,
    SERVER_HOST,
    SERVER_PORT,
};
