/**
 * gitService.test.js
 *
 * Mocha tests for backend/src/services/gitService.js
 *
 * Requirements covered:
 *  - REQ-05: Students should be able to clone their repository
 *  - REQ-06: Students should be able to push to their repository
 *  - REQ-07: Students should be able to pull changes down
 *  - REQ-08: Student removes repository from web portal
 *  - REQ-09: Faculty should be able to clone their repository
 *  - REQ-10: Faculty should be able to push to their repository
 *  - REQ-11: Faculty should be able to pull changes down
 *  - REQ-12: Faculty removes repository from web portal
 *
 * Test strategy:
 *  - Pure/helper functions (validateProjectName, getRepoPath, getGitUrl,
 *    resolveExistingRepoPath) are fully unit-tested with no stubs needed.
 *  - Functions that shell out to git (createRepository, createProject,
 *    addFileToProject, deleteProjectRepository, deleteFileFromProject) are
 *    integration placeholders — they self-skip when git is unavailable.
 *  - deleteProjectRepository is also unit-tested by stubbing fs.rm and
 *    pathExists so it can run without a real filesystem.
 *
 * Windows note:
 *  GIT_BIN is now 'git' on Windows (auto-detected via process.platform).
 *  This means integration tests CAN run on Windows if git is in your PATH,
 *  unlike the previous version which hardcoded /usr/bin/git.
 */

import { strict as assert } from 'assert';
import sinon from 'sinon';
import fs from 'fs/promises';

import gitService from '../src/services/gitService.js';

const {
    validateProjectName,
    getRepoPath,
    getGitUrl,
    resolveExistingRepoPath,
    createRepository,
    createProject,
    addFileToProject,
    deleteFileFromProject,
    deleteProjectRepository,
    inspectProjectRepository,
    getProjectFileBuffer
} = gitService;

// ─────────────────────────────────────────────────────────────────────────────
// Test data
// ─────────────────────────────────────────────────────────────────────────────
const STUDENT_ID   = 'student-uuid-1234';
const FACULTY_ID   = 'faculty-uuid-5678';
const PROJECT_NAME = 'my-project';

// All git clients use this SSH URL format: git@<host>:<path>
const SSH_URL_PATTERN = /^git@[^:]+:.+/;

// ─────────────────────────────────────────────────────────────────────────────
// Helper: check whether BOTH git AND git-annex are available.
// createRepository and createProject require git-annex, not just git.
// On Windows: git is 'git' (PATH); git-annex must also be installed.
// On Linux:   checks /usr/bin/git and git-annex in PATH.
// Integration tests self-skip when either tool is missing.
// ─────────────────────────────────────────────────────────────────────────────
async function gitAvailable() {
    try {
        const { execSync } = await import('child_process');
        const gitCmd = process.platform === 'win32' ? 'git --version' : '/usr/bin/git --version';
        execSync(gitCmd,        { stdio: 'ignore' });
        execSync('git annex version', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────
describe('gitService', function () {

    this.timeout(10000);

    afterEach(function () {
        sinon.restore();
    });

    // =========================================================================
    // validateProjectName — pure function, no stubs needed
    // =========================================================================
    describe('validateProjectName()', function () {

        it('should accept a valid alphanumeric name', function () {
            assert.equal(validateProjectName('my-project_01').valid, true);
        });

        it('should accept a name with hyphens and underscores', function () {
            assert.equal(validateProjectName('valid_name-123').valid, true);
        });

        it('should reject a name shorter than 3 characters', function () {
            const result = validateProjectName('ab');
            assert.equal(result.valid, false);
            assert.ok(result.error, 'Should include an error message');
        });

        it('should reject a name longer than 50 characters', function () {
            assert.equal(validateProjectName('a'.repeat(51)).valid, false);
        });

        it('should reject a name with spaces', function () {
            assert.equal(validateProjectName('my project').valid, false);
        });

        it('should reject a name with special characters', function () {
            assert.equal(validateProjectName('bad!name@here').valid, false);
        });

        it('should reject null', function () {
            assert.equal(validateProjectName(null).valid, false);
        });

        it('should reject undefined', function () {
            assert.equal(validateProjectName(undefined).valid, false);
        });

        it('should reject an empty string', function () {
            assert.equal(validateProjectName('').valid, false);
        });
    });

    // =========================================================================
    // getRepoPath — pure function, no stubs needed
    // =========================================================================
    describe('getRepoPath()', function () {

        it('should return a path ending in <projectName>.git', function () {
            const p = getRepoPath(STUDENT_ID, PROJECT_NAME);
            assert.ok(p.endsWith(`${PROJECT_NAME}.git`),
                `Path should end with ${PROJECT_NAME}.git, got: ${p}`);
        });

        it('should include the userId in the path', function () {
            const p = getRepoPath(STUDENT_ID, PROJECT_NAME);
            assert.ok(p.includes(STUDENT_ID),
                `Path should contain the userId, got: ${p}`);
        });

        it('should produce different paths for student vs faculty', function () {
            assert.notEqual(
                getRepoPath(STUDENT_ID, PROJECT_NAME),
                getRepoPath(FACULTY_ID, PROJECT_NAME),
                'Student and faculty repos must be stored at distinct paths'
            );
        });
    });

    // =========================================================================
    // getGitUrl — REQ-05, REQ-07, REQ-09, REQ-11
    // This is the URL clients use for git clone, git push, and git pull
    // =========================================================================
    describe('getGitUrl() — clone / push / pull URL contract', function () {

        it('should return a valid SSH URL for a student repository (REQ-05, REQ-07)', function () {
            const url = getGitUrl(STUDENT_ID, PROJECT_NAME);
            assert.match(url, SSH_URL_PATTERN,
                `Expected SSH URL (git@host:path), got: ${url}`);
        });

        it('should return a valid SSH URL for a faculty repository (REQ-09, REQ-11)', function () {
            const url = getGitUrl(FACULTY_ID, PROJECT_NAME);
            assert.match(url, SSH_URL_PATTERN,
                `Expected SSH URL (git@host:path), got: ${url}`);
        });

        it('should include the project name in both URLs', function () {
            assert.ok(getGitUrl(STUDENT_ID, PROJECT_NAME).includes(PROJECT_NAME));
            assert.ok(getGitUrl(FACULTY_ID, PROJECT_NAME).includes(PROJECT_NAME));
        });

        it('should scope the student URL to the student userId (REQ-05)', function () {
            const url = getGitUrl(STUDENT_ID, PROJECT_NAME);
            assert.ok(url.includes(STUDENT_ID),
                'Student clone URL must be scoped to the student\'s userId');
        });

        it('should scope the faculty URL to the faculty userId (REQ-09)', function () {
            const url = getGitUrl(FACULTY_ID, PROJECT_NAME);
            assert.ok(url.includes(FACULTY_ID),
                'Faculty clone URL must be scoped to the faculty\'s userId');
        });

        it('should produce different URLs for student vs faculty', function () {
            assert.notEqual(
                getGitUrl(STUDENT_ID, PROJECT_NAME),
                getGitUrl(FACULTY_ID, PROJECT_NAME),
                'Student and faculty must receive distinct URLs to prevent cross-user access'
            );
        });

        it('student URL should be a valid pull URL (REQ-07)', function () {
            // git pull uses the same SSH URL as git clone
            assert.match(getGitUrl(STUDENT_ID, PROJECT_NAME), SSH_URL_PATTERN);
        });

        it('faculty URL should be a valid pull URL (REQ-11)', function () {
            assert.match(getGitUrl(FACULTY_ID, PROJECT_NAME), SSH_URL_PATTERN);
        });
    });

    // =========================================================================
    // resolveExistingRepoPath — unit-testable with fs stubs
    // Falls back through several candidate paths and returns the first that exists
    // =========================================================================
    describe('resolveExistingRepoPath()', function () {

        it('should return the configured path when it exists', async function () {
            // Stub fs.access to succeed only for the first (configured) candidate
            const accessStub = sinon.stub(fs, 'access').resolves(); // all succeed
            const result = await resolveExistingRepoPath(STUDENT_ID, PROJECT_NAME);
            // Should return the first candidate — which is getRepoPath()
            assert.equal(result, getRepoPath(STUDENT_ID, PROJECT_NAME));
            accessStub.restore();
        });

        it('should fall back and return the configured path when no candidate exists', async function () {
            // Stub fs.access to always fail (no path exists)
            sinon.stub(fs, 'access').rejects(new Error('ENOENT'));
            const result = await resolveExistingRepoPath(STUDENT_ID, PROJECT_NAME);
            // When nothing is found it returns the configured path as the default
            assert.equal(result, getRepoPath(STUDENT_ID, PROJECT_NAME));
        });

        it('should return different paths for student vs faculty', async function () {
            sinon.stub(fs, 'access').resolves();
            const studentPath = await resolveExistingRepoPath(STUDENT_ID, PROJECT_NAME);
            const facultyPath = await resolveExistingRepoPath(FACULTY_ID, PROJECT_NAME);
            assert.notEqual(studentPath, facultyPath,
                'Resolved paths must differ per user');
        });
    });

    // =========================================================================
    // deleteProjectRepository — REQ-08, REQ-12
    // Unit-testable by stubbing fs.access and fs.rm
    // =========================================================================
    describe('deleteProjectRepository() — REQ-08 (student), REQ-12 (faculty)', function () {

        it('should call fs.rm on the repo path and return success for a student', async function () {
            // Make pathExists return true (repo exists on filesystem)
            sinon.stub(fs, 'access').resolves();
            const rmStub = sinon.stub(fs, 'rm').resolves();

            const result = await deleteProjectRepository(STUDENT_ID, PROJECT_NAME);

            assert.equal(result.success, true,
                'Should return { success: true } after deleting');
            assert.ok(rmStub.calledOnce,
                'fs.rm should be called exactly once');

            // Confirm the path passed to fs.rm contains the student's userId
            const deletedPath = rmStub.firstCall.args[0];
            assert.ok(deletedPath.includes(STUDENT_ID),
                `Deleted path should be scoped to student, got: ${deletedPath}`);
        });

        it('should call fs.rm on the repo path and return success for a faculty member', async function () {
            sinon.stub(fs, 'access').resolves();
            const rmStub = sinon.stub(fs, 'rm').resolves();

            const result = await deleteProjectRepository(FACULTY_ID, PROJECT_NAME);

            assert.equal(result.success, true);
            assert.ok(rmStub.calledOnce, 'fs.rm should be called exactly once');

            const deletedPath = rmStub.firstCall.args[0];
            assert.ok(deletedPath.includes(FACULTY_ID),
                `Deleted path should be scoped to faculty, got: ${deletedPath}`);
        });

        it('should throw an error when the repo path does not exist on the filesystem', async function () {
            // pathExists returns false — repo storage is missing
            sinon.stub(fs, 'access').rejects(new Error('ENOENT'));

            await assert.rejects(
                () => deleteProjectRepository(STUDENT_ID, PROJECT_NAME),
                (err) => {
                    assert.ok(
                        err.message.includes('missing') || err.message.includes('not found'),
                        `Expected a "missing" error, got: ${err.message}`
                    );
                    return true;
                }
            );
        });

        it('should throw an error if fs.rm fails', async function () {
            sinon.stub(fs, 'access').resolves();
            sinon.stub(fs, 'rm').rejects(new Error('Permission denied'));

            await assert.rejects(
                () => deleteProjectRepository(STUDENT_ID, PROJECT_NAME),
                /Failed to delete repository storage/
            );
        });

        it('student and faculty delete operations should target different paths', async function () {
            sinon.stub(fs, 'access').resolves();
            const rmStub = sinon.stub(fs, 'rm').resolves();

            await deleteProjectRepository(STUDENT_ID, PROJECT_NAME);
            await deleteProjectRepository(FACULTY_ID, PROJECT_NAME);

            const studentDeletedPath = rmStub.firstCall.args[0];
            const facultyDeletedPath = rmStub.secondCall.args[0];

            assert.notEqual(studentDeletedPath, facultyDeletedPath,
                'Student and faculty repos must be deleted from distinct paths');
        });
    });

    // =========================================================================
    // createRepository — integration placeholder
    // Can now run on Windows since GIT_BIN = 'git' when git is in PATH
    // =========================================================================
    describe('createRepository() — integration placeholder', function () {

        it('should return repoPath, userId, and annexUuid after creation', async function () {
            if (!await gitAvailable()) {
                console.log('      ⚠  Skipping: git not available in this environment');
                this.skip();
                return;
            }

            const result = await createRepository(STUDENT_ID, PROJECT_NAME, 'Test repo');
            assert.ok(result.repoPath,  'Should return repoPath');
            assert.ok(result.annexUuid, 'Should return annexUuid from the git-annex branch');
            assert.equal(result.userId, STUDENT_ID);
        });
    });

    // =========================================================================
    // createProject — integration placeholder (REQ-03 + URL generation)
    // =========================================================================
    describe('createProject() — integration placeholder', function () {

        it('should return a student-scoped gitUrl after project creation', async function () {
            if (!await gitAvailable()) {
                console.log('      ⚠  Skipping: git not available in this environment');
                this.skip();
                return;
            }

            const result = await createProject(STUDENT_ID, PROJECT_NAME);
            assert.match(result.gitUrl, SSH_URL_PATTERN);
            assert.ok(result.gitUrl.includes(STUDENT_ID),
                'gitUrl should be scoped to the student');
            assert.equal(result.ownerId, STUDENT_ID);
            assert.equal(result.name,    PROJECT_NAME);
        });

        it('should return a faculty-scoped gitUrl after project creation', async function () {
            if (!await gitAvailable()) {
                console.log('      ⚠  Skipping: git not available in this environment');
                this.skip();
                return;
            }

            const result = await createProject(FACULTY_ID, PROJECT_NAME);
            assert.match(result.gitUrl, SSH_URL_PATTERN);
            assert.ok(result.gitUrl.includes(FACULTY_ID),
                'gitUrl should be scoped to the faculty user');
        });
    });

    // =========================================================================
    // addFileToProject — REQ-06 / REQ-10 (server-side push)
    // Integration placeholder
    // =========================================================================
    describe('addFileToProject() — integration placeholder (REQ-06, REQ-10)', function () {

        it('should push a file and return a gitCommitHash for a student (REQ-06)', async function () {
            if (!await gitAvailable()) {
                console.log('      ⚠  Skipping: git not available in this environment');
                this.skip();
                return;
            }
            // Requires a pre-created repo and temp file — run on cluster node
            console.log('      ⚠  Requires cluster environment with existing repo');
            this.skip();
        });

        it('should push a file and return a gitCommitHash for a faculty member (REQ-10)', async function () {
            if (!await gitAvailable()) {
                console.log('      ⚠  Skipping: git not available in this environment');
                this.skip();
                return;
            }
            console.log('      ⚠  Requires cluster environment with existing repo');
            this.skip();
        });
    });

    // =========================================================================
    // deleteFileFromProject — integration placeholder
    // =========================================================================
    describe('deleteFileFromProject() — integration placeholder', function () {

        it('should delete a file and return a gitCommitHash for a student', async function () {
            if (!await gitAvailable()) {
                console.log('      ⚠  Skipping: git not available in this environment');
                this.skip();
                return;
            }
            console.log('      ⚠  Requires cluster environment with existing repo and file');
            this.skip();
        });

        it('should delete a file and return a gitCommitHash for a faculty member', async function () {
            if (!await gitAvailable()) {
                console.log('      ⚠  Skipping: git not available in this environment');
                this.skip();
                return;
            }
            console.log('      ⚠  Requires cluster environment with existing repo and file');
            this.skip();
        });

        it('should throw an error when the repo path does not exist', async function () {
            // Unit-testable: stub pathExists to return false
            sinon.stub(fs, 'access').rejects(new Error('ENOENT'));

            await assert.rejects(
                () => deleteFileFromProject(STUDENT_ID, PROJECT_NAME, 'somefile.txt'),
                /missing|not found/i
            );
        });
    });

    // =========================================================================
    // inspectProjectRepository — integration placeholder
    // =========================================================================
    describe('inspectProjectRepository() — integration placeholder', function () {

        it('should return branches, commits, and files for an existing repo', async function () {
            if (!await gitAvailable()) {
                console.log('      ⚠  Skipping: git not available in this environment');
                this.skip();
                return;
            }
            console.log('      ⚠  Requires cluster environment with existing repo');
            this.skip();
        });

        it('should throw an error when the repo path does not exist', async function () {
            sinon.stub(fs, 'access').rejects(new Error('ENOENT'));

            await assert.rejects(
                () => inspectProjectRepository(STUDENT_ID, PROJECT_NAME),
                /missing|not found/i
            );
        });
    });

    // =========================================================================
    // getProjectFileBuffer — integration placeholder
    // =========================================================================
    describe('getProjectFileBuffer() — integration placeholder', function () {

        it('should return a buffer and size for an existing file', async function () {
            if (!await gitAvailable()) {
                console.log('      ⚠  Skipping: git not available in this environment');
                this.skip();
                return;
            }
            console.log('      ⚠  Requires cluster environment with existing repo and file');
            this.skip();
        });

        it('should throw an error when the repo path does not exist', async function () {
            sinon.stub(fs, 'access').rejects(new Error('ENOENT'));

            await assert.rejects(
                () => getProjectFileBuffer(STUDENT_ID, PROJECT_NAME, 'somefile.txt'),
                /missing|not found/i
            );
        });
    });
});
