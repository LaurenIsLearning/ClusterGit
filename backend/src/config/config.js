import path from 'path';
import os from 'os';

// Repository storage configuration
export const REPO_BASE_PATH = process.env.REPO_BASE_PATH || path.join(os.homedir(), 'clustergit-repos');

// Git-annex configuration
export const GIT_ANNEX_CONFIG = {
    backend: 'SHA256E', // Cryptographic hash + extension
    largeFileThreshold: 1024 * 1024, // 1MB
    numCopies: 1, // Minimum number of copies
};

// Server configuration
export const SERVER_HOST = process.env.SERVER_HOST || 'localhost';
export const SERVER_PORT = process.env.PORT || 8080;

export default {
    REPO_BASE_PATH,
    GIT_ANNEX_CONFIG,
    SERVER_HOST,
    SERVER_PORT,
};
