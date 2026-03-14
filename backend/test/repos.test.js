/**
 * repos.test.js
 *
 * Mocha tests for backend/src/routes/repos.js
 *
 * Requirements covered:
 *  - REQ-03: Both users (student & faculty) should be able to create repositories
 *  - REQ-04: Both users (student & faculty) should be able to access the repository info screen
 *
 * Auth middleware (requireAuth from authMiddleware.js):
 *   1. Reads req.headers.authorization
 *   2. Strips "Bearer " prefix
 *   3. Calls supabase.auth.getUser(token)
 *   4. On success: sets req.user = user and calls next()
 *   5. On failure: returns 401
 *
 * Our stubAuth() helper stubs supabase.auth.getUser so requireAuth
 * passes through with the mock user we supply.
 */

import { strict as assert } from 'assert';
import sinon from 'sinon';
import request from 'supertest';

import app from '../src/app.js';
import { supabase } from '../src/utils/supabase.js';
import gitService from '../src/services/gitService.js';


// ─────────────────────────────────────────────────────────────────────────────
// Test data
// ─────────────────────────────────────────────────────────────────────────────
const STUDENT_ID    = 'student-uuid-1234';
const FACULTY_ID    = 'faculty-uuid-5678';
const STUDENT_TOKEN = 'mock-student-jwt';
const FACULTY_TOKEN = 'mock-faculty-jwt';

const MOCK_PROJECT_INPUT = {
    name:        'test-repo',
    description: 'A test repository',
    is_public:   false
};

// Simulated DB row returned after a successful insert into repositories table
const MOCK_DB_ROW_STUDENT = {
    id:             'repo-uuid-abc',
    name:           'test-repo',
    owner_id:       STUDENT_ID,
    is_public:      false,
    git_annex_uuid: 'annex-uuid-xyz',
    created_at:     new Date().toISOString()
};

const MOCK_DB_ROW_FACULTY = {
    ...MOCK_DB_ROW_STUDENT,
    id:       'repo-uuid-faculty',
    owner_id: FACULTY_ID
};

const STUDENT_GIT_URL = `git@10.27.12.244:/repos/${STUDENT_ID}/test-repo.git`;
const FACULTY_GIT_URL = `git@10.27.12.244:/repos/${FACULTY_ID}/test-repo.git`;

function makeCreateProjectResult(ownerId) {
    return {
        name:        'test-repo',
        description: 'A test repository',
        repoPath:    `/repos/${ownerId}/test-repo.git`,
        gitUrl:      `git@10.27.12.244:/repos/${ownerId}/test-repo.git`,
        size:        0,
        annexUuid:   'annex-uuid-xyz',
        ownerId
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: make requireAuth pass by stubbing supabase.auth.getUser
// requireAuth does: const { data: { user }, error } = await supabase.auth.getUser(token)
// ─────────────────────────────────────────────────────────────────────────────
function stubAuth(userId, role = 'student') {
    return sinon.stub(supabase.auth, 'getUser').resolves({
        data:  { user: { id: userId, email: `${role}@university.edu` } },
        error: null
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: chainable Supabase stub covering all query patterns in repos.js
//
//   POST /create uses:
//     .from('repositories').select('id').eq().eq().single()   → duplicate check
//     .from('repositories').insert().select().single()        → insert row
//     .from('collaborators').upsert()                         → add owner
//     .from('activity_log').insert()                          → log event
//
//   GET /my uses:
//     .from('repositories').select('*').eq().order()          → list repos
// ─────────────────────────────────────────────────────────────────────────────
function makeChain({ singleData = null, singleError = null, listData = [] } = {}) {
    return {
        select: sinon.stub().returnsThis(),
        insert: sinon.stub().returnsThis(),
        upsert: sinon.stub().resolves({ error: null }),
        update: sinon.stub().returnsThis(),
        delete: sinon.stub().returnsThis(),
        eq:     sinon.stub().returnsThis(),
        order:  sinon.stub().resolves({ data: listData, error: null }),
        single: sinon.stub().resolves({ data: singleData, error: singleError }),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────
describe('Repos Routes', function () {

    this.timeout(5000);

    // sinon.restore() in afterEach cleans up ALL stubs created in each test,
    // including those created in beforeEach. No manual cleanup needed.
    afterEach(function () {
        sinon.restore();
    });

    // =========================================================================
    // REQ-03 — Create Repository   POST /api/repos/create
    // =========================================================================
    describe('REQ-03 | Create Repository  POST /api/repos/create', function () {

        // ── Student ──────────────────────────────────────────────────────────
        describe('Student creates a repository', function () {

            let createProjectStub;
            let fromStub;

            beforeEach(function () {
                stubAuth(STUDENT_ID, 'student');
                createProjectStub = sinon.stub(gitService, 'createProject')
                    .resolves(makeCreateProjectResult(STUDENT_ID));

                // POST /create hits repositories twice:
                //   call 1 — duplicate name check → no match (PGRST116 = no rows found)
                //   call 2 — insert new row        → return DB row
                // Then collaborators and activity_log once each.
                let repoCallCount = 0;
                fromStub = sinon.stub(supabase, 'from').callsFake((table) => {
                    if (table === 'repositories') {
                        repoCallCount++;
                        return repoCallCount === 1
                            ? makeChain({ singleData: null, singleError: { code: 'PGRST116' } })
                            : makeChain({ singleData: MOCK_DB_ROW_STUDENT });
                    }
                    return makeChain({});
                });
            });

            it('should return 200 with { success: true, project } for a valid student repo', async function () {
                const res = await request(app)
                    .post('/api/repos/create')
                    .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
                    .send(MOCK_PROJECT_INPUT)
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 200,
                    `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
                assert.equal(res.body.success, true,
                    'Response body should have success: true');
                assert.ok(res.body.project,
                    'Response body should contain a project object');
            });

            it('should call gitService.createProject with the student userId and project name', async function () {
                await request(app)
                    .post('/api/repos/create')
                    .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
                    .send(MOCK_PROJECT_INPUT)
                    .set('Content-Type', 'application/json');

                assert.ok(createProjectStub.calledOnce,
                    'createProject should be called exactly once');
                const [calledUserId, calledName] = createProjectStub.firstCall.args;
                assert.equal(calledUserId, STUDENT_ID,
                    'createProject must receive the authenticated student\'s ID');
                assert.equal(calledName, MOCK_PROJECT_INPUT.name,
                    'createProject must receive the submitted project name');
            });

            it('should perform a duplicate name check before inserting', async function () {
                await request(app)
                    .post('/api/repos/create')
                    .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
                    .send(MOCK_PROJECT_INPUT)
                    .set('Content-Type', 'application/json');

                const repoTableCalls = fromStub.args.filter(a => a[0] === 'repositories');
                assert.ok(repoTableCalls.length >= 2,
                    'repositories table should be queried for duplicate check AND insert');
            });

            it('should add the owner as a collaborator after creation', async function () {
                await request(app)
                    .post('/api/repos/create')
                    .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
                    .send(MOCK_PROJECT_INPUT)
                    .set('Content-Type', 'application/json');

                const collabCalls = fromStub.args.filter(a => a[0] === 'collaborators');
                assert.ok(collabCalls.length >= 1,
                    'collaborators table should be written after repo creation');
            });
        });

        // ── Faculty ──────────────────────────────────────────────────────────
        describe('Faculty creates a repository', function () {

            let createProjectStub;
            let fromStub;

            beforeEach(function () {
                stubAuth(FACULTY_ID, 'faculty');
                createProjectStub = sinon.stub(gitService, 'createProject')
                    .resolves(makeCreateProjectResult(FACULTY_ID));

                let repoCallCount = 0;
                fromStub = sinon.stub(supabase, 'from').callsFake((table) => {
                    if (table === 'repositories') {
                        repoCallCount++;
                        return repoCallCount === 1
                            ? makeChain({ singleData: null, singleError: { code: 'PGRST116' } })
                            : makeChain({ singleData: MOCK_DB_ROW_FACULTY });
                    }
                    return makeChain({});
                });
            });

            it('should return 200 with { success: true, project } for a valid faculty repo', async function () {
                const res = await request(app)
                    .post('/api/repos/create')
                    .set('Authorization', `Bearer ${FACULTY_TOKEN}`)
                    .send(MOCK_PROJECT_INPUT)
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 200,
                    `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
                assert.equal(res.body.success, true);
                assert.ok(res.body.project);
            });

            it('should call gitService.createProject with the faculty userId', async function () {
                await request(app)
                    .post('/api/repos/create')
                    .set('Authorization', `Bearer ${FACULTY_TOKEN}`)
                    .send(MOCK_PROJECT_INPUT)
                    .set('Content-Type', 'application/json');

                assert.ok(createProjectStub.calledOnce);
                const [calledUserId] = createProjectStub.firstCall.args;
                assert.equal(calledUserId, FACULTY_ID,
                    'createProject must receive the faculty user\'s ID, not a student ID');
            });
        });

        // ── Validation & error cases ─────────────────────────────────────────
        describe('Input validation and error handling', function () {

            it('should return 401 when no auth token is provided', async function () {
                const res = await request(app)
                    .post('/api/repos/create')
                    .send(MOCK_PROJECT_INPUT)
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 401,
                    'Unauthenticated create requests must be rejected');
            });

            it('should return 401 when an invalid token is provided', async function () {
                sinon.stub(supabase.auth, 'getUser').resolves({
                    data:  { user: null },
                    error: { message: 'Invalid JWT' }
                });

                const res = await request(app)
                    .post('/api/repos/create')
                    .set('Authorization', 'Bearer bad-token')
                    .send(MOCK_PROJECT_INPUT)
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 401);
            });

            it('should return 400 when project name is missing', async function () {
                stubAuth(STUDENT_ID, 'student');

                const res = await request(app)
                    .post('/api/repos/create')
                    .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
                    .send({ description: 'no name here' })
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 400);
                assert.ok(res.body.error?.message);
            });

            it('should return 400 when project name contains invalid characters', async function () {
                stubAuth(STUDENT_ID, 'student');

                const res = await request(app)
                    .post('/api/repos/create')
                    .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
                    .send({ name: 'bad name!@#' })
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 400);
                assert.ok(res.body.error?.message);
            });

            it('should return 400 when project name is shorter than 3 characters', async function () {
                stubAuth(STUDENT_ID, 'student');

                const res = await request(app)
                    .post('/api/repos/create')
                    .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
                    .send({ name: 'ab' })
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 400);
            });

            it('should return 400 when a duplicate project name already exists for the user', async function () {
                stubAuth(STUDENT_ID, 'student');

                // Duplicate check returns a row — name already taken
                sinon.stub(supabase, 'from').callsFake((table) => {
                    if (table === 'repositories') {
                        return makeChain({ singleData: { id: 'existing-repo-id' } });
                    }
                    return makeChain({});
                });

                const res = await request(app)
                    .post('/api/repos/create')
                    .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
                    .send(MOCK_PROJECT_INPUT)
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 400);
                assert.ok(res.body.error?.message.includes('already exists'),
                    'Error message should indicate the name is taken');
            });
        });
    });

    // =========================================================================
    // REQ-04 — Repository Info Screen   GET /api/repos/my
    // =========================================================================
    describe('REQ-04 | Repository Info  GET /api/repos/my', function () {

        // The /my route:
        //   1. Queries repositories where owner_id = req.user.id, ordered by created_at DESC
        //   2. Enriches each entry: adds .repo (git URL), .size (MB string), .updated (date string)
        //   3. Returns the enriched array directly (no wrapper object)

        // ── Student ──────────────────────────────────────────────────────────
        describe('Student accesses repository information', function () {

            beforeEach(function () {
                stubAuth(STUDENT_ID, 'student');
                sinon.stub(supabase, 'from').callsFake(() =>
                    makeChain({ listData: [MOCK_DB_ROW_STUDENT] })
                );
                sinon.stub(gitService, 'getRepoPath').returns(`/repos/${STUDENT_ID}/test-repo.git`);
                sinon.stub(gitService, 'getGitUrl').returns(STUDENT_GIT_URL);
                sinon.stub(gitService, 'getRepoSize').resolves(1024 * 1024); // 1 MB
            });

            it('should return 200 with an array of repos', async function () {
                const res = await request(app)
                    .get('/api/repos/my')
                    .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

                assert.equal(res.status, 200,
                    `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
                assert.ok(Array.isArray(res.body),
                    'Response should be an array of repositories');
            });

            it('should include repo (git URL) on each entry so the student can clone', async function () {
                const res = await request(app)
                    .get('/api/repos/my')
                    .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

                const repo = res.body[0];
                assert.ok(repo, 'Should contain at least one repo entry');
                assert.ok(
                    repo.repo || repo.git_url,
                    'Each entry must include a git URL field'
                );
            });

            it('should include name, size, and updated fields on each entry', async function () {
                const res = await request(app)
                    .get('/api/repos/my')
                    .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

                const repo = res.body[0];
                assert.ok(repo.name,    'Repo should have a name field');
                assert.ok(repo.size,    'Repo should have a size field');
                assert.ok(repo.updated, 'Repo should have an updated field');
            });

            it('should only return repos where owner_id matches the student', async function () {
                const res = await request(app)
                    .get('/api/repos/my')
                    .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

                res.body.forEach((repo, i) => {
                    assert.equal(repo.owner_id, STUDENT_ID,
                        `Repo[${i}] owner_id is ${repo.owner_id}, expected ${STUDENT_ID}`);
                });
            });

            // Note: afterEach sinon.restore() runs AFTER this test, so we
            // set up fresh stubs inside the test body rather than calling
            // sinon.restore() manually mid-suite.
            it('should return an empty array when the student has no repos', async function () {
                // These stubs are created AFTER the beforeEach stubs.
                // sinon allows overriding — the last stub on the same method wins.
                // We replace the from stub to return an empty list.
                supabase.from.restore();
                sinon.stub(supabase, 'from').callsFake(() => makeChain({ listData: [] }));

                const res = await request(app)
                    .get('/api/repos/my')
                    .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

                assert.equal(res.status, 200);
                assert.deepEqual(res.body, [],
                    'Should return an empty array, not an error, when no repos exist');
            });
        });

        // ── Faculty ──────────────────────────────────────────────────────────
        describe('Faculty accesses repository information', function () {

            beforeEach(function () {
                stubAuth(FACULTY_ID, 'faculty');
                sinon.stub(supabase, 'from').callsFake(() =>
                    makeChain({ listData: [MOCK_DB_ROW_FACULTY] })
                );
                sinon.stub(gitService, 'getRepoPath').returns(`/repos/${FACULTY_ID}/test-repo.git`);
                sinon.stub(gitService, 'getGitUrl').returns(FACULTY_GIT_URL);
                sinon.stub(gitService, 'getRepoSize').resolves(2 * 1024 * 1024); // 2 MB
            });

            it('should return 200 with an array of repos for the faculty member', async function () {
                const res = await request(app)
                    .get('/api/repos/my')
                    .set('Authorization', `Bearer ${FACULTY_TOKEN}`);

                assert.equal(res.status, 200,
                    `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
                assert.ok(Array.isArray(res.body), 'Response should be an array');
            });

            it('should include a faculty-scoped git URL on each entry', async function () {
                const res = await request(app)
                    .get('/api/repos/my')
                    .set('Authorization', `Bearer ${FACULTY_TOKEN}`);

                const repo = res.body[0];
                assert.ok(repo, 'Should contain at least one repo entry');
                const gitUrl = repo.repo || repo.git_url;
                assert.ok(gitUrl, 'Repo should have a git URL');
                assert.ok(gitUrl.includes(FACULTY_ID),
                    'The git URL must be scoped to the faculty user, not a student');
            });

            it('should only return repos belonging to the authenticated faculty member', async function () {
                const res = await request(app)
                    .get('/api/repos/my')
                    .set('Authorization', `Bearer ${FACULTY_TOKEN}`);

                res.body.forEach((repo, i) => {
                    assert.equal(repo.owner_id, FACULTY_ID,
                        `Repo[${i}] should belong to faculty, not another user`);
                });
            });
        });

        // ── Auth guard ───────────────────────────────────────────────────────
        describe('Auth guard on GET /api/repos/my', function () {

            it('should return 401 when no auth token is provided', async function () {
                const res = await request(app)
                    .get('/api/repos/my');

                assert.equal(res.status, 401,
                    'requireAuth should block requests with no Authorization header');
            });

            it('should return 401 when an invalid token is provided', async function () {
                sinon.stub(supabase.auth, 'getUser').resolves({
                    data:  { user: null },
                    error: { message: 'Invalid JWT' }
                });

                const res = await request(app)
                    .get('/api/repos/my')
                    .set('Authorization', 'Bearer completely-invalid-token');

                assert.equal(res.status, 401);
            });
        });
    });
});
