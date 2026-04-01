/**
 * newTests.test.js
 *
 * 3 additional Mocha tests for backend/src/routes/repos.js
 *
 * RTM Test Cases covered:
 *  - CRE-01 : Create a repository with a unique name  (Req B-03)
 *  - DEL-01 : Student deletes their own repository     (Req ST-04)
 *  - VIEW-03: Student tries to access another student's private repo (Req B-04)
 *
 * Strategy (matches team conventions):
 *  - supertest  : fires real HTTP requests against the Express app
 *  - sinon      : stubs supabase + gitService so no real network/DB/disk calls
 *  - assert     : Node built-in strict assertions
 */

import { strict as assert } from 'assert';
import sinon from 'sinon';
import request from 'supertest';

import app from '../src/app.js';
import { supabase } from '../src/utils/supabase.js';
import gitService from '../src/services/gitService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Shared test data
// ─────────────────────────────────────────────────────────────────────────────
const STUDENT_ID    = 'student-uuid-1234';
const FACULTY_ID    = 'faculty-uuid-5678';
const STUDENT_TOKEN = 'mock-student-jwt';
const FACULTY_TOKEN = 'mock-faculty-jwt';

const STUDENT_REPO_ID = 'repo-uuid-student-abc';
const FACULTY_REPO_ID = 'repo-uuid-faculty-xyz';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: stub requireAuth middleware so it sets req.user
// ─────────────────────────────────────────────────────────────────────────────
function stubAuth(userId, role = 'student') {
    return sinon.stub(supabase.auth, 'getUser').resolves({
        data:  { user: { id: userId, email: `${role}@JayTheJohn.edu` } },
        error: null
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: generic chainable Supabase query stub
// ─────────────────────────────────────────────────────────────────────────────
function makeChain({ singleData = null, singleError = null, listData = [] } = {}) {
    return {
        select:      sinon.stub().returnsThis(),
        insert:      sinon.stub().returnsThis(),
        upsert:      sinon.stub().resolves({ error: null }),
        update:      sinon.stub().returnsThis(),
        delete:      sinon.stub().returnsThis(),
        eq:          sinon.stub().returnsThis(),
        in:          sinon.stub().returnsThis(),
        or:          sinon.stub().returnsThis(),
        order:       sinon.stub().resolves({ data: listData, error: null }),
        single:      sinon.stub().resolves({ data: singleData, error: singleError }),
        maybeSingle: sinon.stub().resolves({ data: singleData, error: singleError }),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────
describe('Additional RTM Test Cases', function () {

    this.timeout(5000);

    afterEach(function () {
        sinon.restore();
    });

    // =========================================================================
    // CRE-01 — Create repository with a unique name   POST /api/repos/create
    // Requirement: B-03 — Both users should be able to create repositories
    // =========================================================================
    describe('CRE-01 | Create repository with unique name', function () {

        it('should return 200 with the new project when a unique name is provided', async function () {
            // Arrange: authenticate as student
            stubAuth(STUDENT_ID, 'student');

            // Stub gitService.createProject to succeed
            sinon.stub(gitService, 'createProject').resolves({
                name:        'testRepo',
                description: '',
                repoPath:    `/repos/${STUDENT_ID}/testRepo.git`,
                gitUrl:      `git@10.27.12.244:/repos/${STUDENT_ID}/testRepo.git`,
                size:        0,
                annexUuid:   'annex-uuid-new',
                ownerId:     STUDENT_ID
            });

            // Stub supabase.from() calls:
            //   Call 1 — duplicate check on 'repositories' → no match (PGRST116)
            //   Call 2 — insert into 'repositories'         → returns new row
            //   Remaining — collaborators, activity_log      → succeed silently
            const mockDbRow = {
                id:             STUDENT_REPO_ID,
                name:           'testRepo',
                owner_id:       STUDENT_ID,
                is_public:      false,
                git_annex_uuid: 'annex-uuid-new',
                created_at:     new Date().toISOString()
            };

            let repoCallCount = 0;
            sinon.stub(supabase, 'from').callsFake((table) => {
                if (table === 'repositories') {
                    repoCallCount++;
                    // First call = duplicate check (no rows → PGRST116)
                    // Second call = insert → return new row
                    return repoCallCount === 1
                        ? makeChain({ singleData: null, singleError: { code: 'PGRST116' } })
                        : makeChain({ singleData: mockDbRow });
                }
                // collaborators, activity_log
                return makeChain({});
            });

            // Act
            const res = await request(app)
                .post('/api/repos/create')
                .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
                .send({ name: 'testRepo' })
                .set('Content-Type', 'application/json');

            // Assert — RTM expected result:
            //   "Screen redirects to the viewing of the newly created repo"
            //   Backend equivalent: 200 with { success: true, project }
            assert.equal(res.status, 200,
                `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
            assert.equal(res.body.success, true,
                'Response should have success: true');
            assert.ok(res.body.project,
                'Response should contain the newly created project object');
            assert.equal(res.body.project.name, 'testRepo',
                'Returned project name should match the submitted name');
        });
    });

    // =========================================================================
    // DEL-01 — Student deletes their own repository   DELETE /api/repos/:id
    // Requirement: ST-04 — Student removes repository from web portal
    // =========================================================================
    describe('DEL-01 | Student deletes their own repository', function () {

        it('should return 200 with success message when a student deletes their repo', async function () {
            // Arrange: authenticate as student
            stubAuth(STUDENT_ID, 'student');

            // Stub gitService.deleteProjectRepository to succeed
            const deleteStub = sinon.stub(gitService, 'deleteProjectRepository').resolves();

            // Stub supabase.from() calls:
            //   'repositories' select (ownership check) → returns the student's repo
            //   'repositories' delete                    → succeeds
            //   'activity_log' insert                    → succeeds
            const mockRepoRow = {
                id:       STUDENT_REPO_ID,
                name:     'testRepo',
                owner_id: STUDENT_ID
            };

            sinon.stub(supabase, 'from').callsFake((table) => {
                if (table === 'repositories') {
                    return makeChain({ singleData: mockRepoRow });
                }
                // activity_log
                return makeChain({});
            });

            // Act
            const res = await request(app)
                .delete(`/api/repos/${STUDENT_REPO_ID}`)
                .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

            // Assert — RTM expected result:
            //   "successfully remove the repository off of storage on the server"
            assert.equal(res.status, 200,
                `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
            assert.equal(res.body.success, true,
                'Response should have success: true');
            assert.ok(res.body.message,
                'Response should contain a success message');

            // Verify the actual storage deletion was triggered — this is the core
            // of DEL-01.  Without this check the test would still pass even if
            // someone removed the deleteProjectRepository call from the route.
            assert.ok(deleteStub.calledOnce,
                'gitService.deleteProjectRepository must be called exactly once');
            assert.equal(deleteStub.firstCall.args[0], STUDENT_ID,
                'deleteProjectRepository should receive the student userId');
            assert.equal(deleteStub.firstCall.args[1], 'testRepo',
                'deleteProjectRepository should receive the repo name');
        });
    });

    // =========================================================================
    // VIEW-03 — Student accesses another student's private repo
    //            GET /api/repos/:id/files
    // Requirement: B-04 — Both users should be able to access the repository
    //                      information screen (negative case: access denied)
    // =========================================================================
    describe('VIEW-03 | Student tries to view a private repo owned by another student', function () {

        it('should return 403 when a student tries to access a repo they do not own', async function () {
            // Arrange: authenticate as student1
            const STUDENT2_ID = 'student-uuid-9999';
            stubAuth(STUDENT_ID, 'student');

            // The repo exists but is owned by student2, not the authenticated student1
            const otherStudentRepo = {
                id:       'repo-uuid-other',
                name:     'privateRepo',
                owner_id: STUDENT2_ID          // different from STUDENT_ID
            };

            sinon.stub(supabase, 'from').callsFake(() =>
                makeChain({ singleData: otherStudentRepo })
            );

            // Act — student1 tries to view student2's repo files
            const res = await request(app)
                .get(`/api/repos/${otherStudentRepo.id}/files`)
                .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

            // Assert — RTM expected result: "Access denied error"
            assert.equal(res.status, 403,
                `Expected 403 Forbidden but got ${res.status}: ${JSON.stringify(res.body)}`);
            assert.ok(res.body.error?.message,
                'Response should contain an error message');
            assert.ok(
                res.body.error.message.toLowerCase().includes('permission'),
                'Error message should mention lack of permission'
            );
        });
    });
});