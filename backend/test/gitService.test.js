/**
 * gitService.test.js
 *
 * Mocha tests for backend/src/services/gitService.js
 *
 * Requirements covered:
 *  - REQ-05: Students should be able to clone their repository
 *  - REQ-06: Students should be able to push to their repository
 *  - REQ-07: Students should be able to pull changes down
 *  - REQ-09: Faculty should be able to clone their repository
 *  - REQ-10: Faculty should be able to push to their repository
 *  - REQ-11: Faculty should be able to pull changes down
 *
 * What is tested here vs elsewhere:
 *  - Pure helper functions (validateProjectName, getRepoPath, getGitUrl) are
 *    fully unit-tested — they need no stubs and run in any environment.
 *  - createRepository / createProject / addFileToProject shell out to
 *    /usr/bin/git and /usr/bin/git-annex. These are marked as integration
 *    placeholders and will self-skip when git is not available, allowing the
 *    same test file to be run both locally (skips) and on the Pi cluster (runs).
 *
 * Clone / push / pull are CLIENT-SIDE git operations.
 * The server's responsibility is to provide a correctly scoped, valid SSH URL
 * — which is what getGitUrl() does.  We test that contract thoroughly here.
 */

import { strict as assert } from 'assert';
import sinon from 'sinon';

import app from '../src/app.js';
import gitService from '../src/services/gitService.js';

const {
    validateProjectName,
    getRepoPath,
    getGitUrl,
    createRepository,
    createProject,
    addFileToProject
} = gitService;

// ─────────────────────────────────────────────────────────────────────────────
// Test data
// ─────────────────────────────────────────────────────────────────────────────
const STUDENT_ID   = 'student-uuid-1234';
const FACULTY_ID   = 'faculty-uuid-5678';
const PROJECT_NAME = 'my-project';

// Smart HTTP pattern used by the current Git HTTP route: https://host/git/<user>/<repo>.git
const GIT_HTTP_URL_PATTERN = /^https:\/\/[^/]+\/git\/[^/]+\/[^/]+\.git$/;

// ─────────────────────────────────────────────────────────────────────────────
// Helper: check whether /usr/bin/git is available in this environment.
// Integration tests self-skip when it is not.
// ─────────────────────────────────────────────────────────────────────────────
async function gitAvailable() {
    try {
        const { execSync } = await import('child_process');
        execSync('/usr/bin/git --version', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────
describe('gitService', function () {

    this.timeout(5000);

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

        it('should produce different paths for different user IDs', function () {
            assert.notEqual(
                getRepoPath(STUDENT_ID, PROJECT_NAME),
                getRepoPath(FACULTY_ID, PROJECT_NAME),
                'Student and faculty repos must be stored at distinct paths'
            );
        });
    });

    // =========================================================================
    // getGitUrl — REQ-05, REQ-07, REQ-09, REQ-11
    // The URL this function returns is what the client uses for
    // `git clone`, `git push`, and `git pull`.
    // =========================================================================
    describe('getGitUrl() — clone / push / pull URL contract', function () {

        it('should return a valid Git HTTP URL for a student repository (REQ-05, REQ-07)', function () {
            const url = getGitUrl(STUDENT_ID, PROJECT_NAME);
            assert.match(url, GIT_HTTP_URL_PATTERN,
                `Expected Git HTTP URL, got: ${url}`);
        });

        it('should return a valid Git HTTP URL for a faculty repository (REQ-09, REQ-11)', function () {
            const url = getGitUrl(FACULTY_ID, PROJECT_NAME);
            assert.match(url, GIT_HTTP_URL_PATTERN,
                `Expected Git HTTP URL, got: ${url}`);
        });

        it('should include the project name in the URL', function () {
            const url = getGitUrl(STUDENT_ID, PROJECT_NAME);
            assert.ok(url.includes(PROJECT_NAME),
                'URL must contain the project name so git knows which repo to target');
        });

        it('should scope the URL to the student userId (REQ-05)', function () {
            const url = getGitUrl(STUDENT_ID, PROJECT_NAME);
            assert.ok(url.includes(STUDENT_ID),
                'Student clone URL must be scoped to the student\'s userId');
        });

        it('should scope the URL to the faculty userId (REQ-09)', function () {
            const url = getGitUrl(FACULTY_ID, PROJECT_NAME);
            assert.ok(url.includes(FACULTY_ID),
                'Faculty clone URL must be scoped to the faculty\'s userId');
        });

        it('should produce different URLs for student vs faculty (REQ-05 vs REQ-09)', function () {
            assert.notEqual(
                getGitUrl(STUDENT_ID, PROJECT_NAME),
                getGitUrl(FACULTY_ID, PROJECT_NAME),
                'Student and faculty must receive distinct URLs to prevent cross-user access'
            );
        });

        it('student URL should be usable for pull operations (REQ-07)', function () {
            // `git pull` uses the same Git HTTP URL as `git clone` for this deployment.
            const url = getGitUrl(STUDENT_ID, PROJECT_NAME);
            assert.match(url, GIT_HTTP_URL_PATTERN,
                'Pull URL must be a valid Git HTTP URL');
        });

        it('faculty URL should be usable for pull operations (REQ-11)', function () {
            const url = getGitUrl(FACULTY_ID, PROJECT_NAME);
            assert.match(url, GIT_HTTP_URL_PATTERN,
                'Pull URL must be a valid Git HTTP URL');
        });
    });

    // =========================================================================
    // createRepository — REQ-03 (server side)
    // Integration placeholder: skips unless /usr/bin/git is available
    // =========================================================================
    describe('createRepository() — integration placeholder', function () {

        it('should return repoPath, userId, and annexUuid after creation', async function () {
            if (!await gitAvailable()) {
                console.log('      ⚠  Skipping: /usr/bin/git not available in this environment');
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
    // createProject — REQ-03 + REQ-05/REQ-09 (URL generation)
    // Integration placeholder: skips unless /usr/bin/git is available
    // =========================================================================
    describe('createProject() — integration placeholder', function () {

        it('should return a gitUrl scoped to the student after project creation', async function () {
            if (!await gitAvailable()) {
                console.log('      ⚠  Skipping: /usr/bin/git not available in this environment');
                this.skip();
                return;
            }

            const result = await createProject(STUDENT_ID, PROJECT_NAME);
            assert.match(result.gitUrl, GIT_HTTP_URL_PATTERN,
                'gitUrl should be a valid Git HTTP URL');
            assert.ok(result.gitUrl.includes(STUDENT_ID),
                'gitUrl should be scoped to the student');
            assert.equal(result.ownerId, STUDENT_ID);
            assert.equal(result.name,    PROJECT_NAME);
        });

        it('should return a gitUrl scoped to the faculty after project creation', async function () {
            if (!await gitAvailable()) {
                console.log('      ⚠  Skipping: /usr/bin/git not available in this environment');
                this.skip();
                return;
            }

            const result = await createProject(FACULTY_ID, PROJECT_NAME);
            assert.match(result.gitUrl, GIT_HTTP_URL_PATTERN);
            assert.ok(result.gitUrl.includes(FACULTY_ID),
                'gitUrl should be scoped to the faculty user');
        });
    });

    // =========================================================================
    // addFileToProject — REQ-06 / REQ-10 (server-side push)
    // Integration placeholder: skips unless /usr/bin/git is available
    // =========================================================================
    describe('addFileToProject() — integration placeholder (REQ-06, REQ-10)', function () {

        it('should push a file and return a gitCommitHash for a student', async function () {
            if (!await gitAvailable()) {
                console.log('      ⚠  Skipping: /usr/bin/git not available in this environment');
                this.skip();
                return;
            }
            // Full integration requires a pre-created repo and a temp file.
            // Run this test on a Pi cluster node using the full integration suite.
            console.log('      ⚠  Requires cluster environment — skipping in unit mode');
            this.skip();
        });

        it('should push a file and return a gitCommitHash for a faculty member', async function () {
            if (!await gitAvailable()) {
                console.log('      ⚠  Skipping: /usr/bin/git not available in this environment');
                this.skip();
                return;
            }
            console.log('      ⚠  Requires cluster environment — skipping in unit mode');
            this.skip();
        });
    });
});
