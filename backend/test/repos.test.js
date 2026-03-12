/**
 * repos.test.js
 *
 * Mocha tests for backend/src/routes/repos.js
 *
 * Requirements covered:
 *  - REQ-03: Both users (student & faculty) should be able to create repositories
 *  - REQ-04: Both users (student & faculty) should be able to access the repository info screen
 *  - REQ-08: Student removes repository from web portal
 *  - REQ-12: Faculty removes repository from web portal
 *
 * Notes on environment.js:
 *  - Tests run on localhost so getEnvironmentKey() always returns "local"
 *  - applyEnvironmentFilter() adds .or() to queries in local mode
 *  - Our chain stub returns .returnsThis() for all chaining methods including .or()
 *    so the filter is applied but has no real effect on the stubbed responses
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

const MOCK_DB_ROW_STUDENT = {
    id:              'repo-uuid-abc',
    name:            'test-repo',
    owner_id:        STUDENT_ID,
    is_public:       false,
    git_annex_uuid:  'annex-uuid-xyz',
    environment_key: 'local',
    created_at:      new Date().toISOString(),
    last_activity_at: new Date().toISOString()
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
// Helper: stub requireAuth by stubbing supabase.auth.getUser
// requireAuth does:
//   const { data: { user }, error } = await supabase.auth.getUser(token)
// ─────────────────────────────────────────────────────────────────────────────
function stubAuth(userId, role = 'student') {
    return sinon.stub(supabase.auth, 'getUser').resolves({
        data:  { user: { id: userId, email: `${role}@university.edu` } },
        error: null
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: fully chainable Supabase stub
//
// Covers all query patterns used in repos.js including the environment filter:
//   applyEnvironmentFilter adds .or() in local mode
//   applyEnvironmentFilter adds .eq() in preview/production mode
//
//   POST /create:
//     .from('repositories').select().eq().eq().or().single()  → duplicate check
//     .from('repositories').insert().select().single()        → insert row
//     .from('collaborators').upsert()                         → add owner
//     .from('activity_log').insert()                          → log event
//
//   GET /my:
//     .from('repositories').select().eq().or().order()        → list repos
//     .from('annex_objects').select().in()                    → sizes
//
//   DELETE /:id:
//     .from('repositories').select().eq().or().single()       → load repo
//     .from('repositories').delete().eq().eq()                → delete row
//     .from('activity_log').insert()                          → log event
// ─────────────────────────────────────────────────────────────────────────────
function makeChain({ singleData = null, singleError = null, listData = [], deleteError = null } = {}) {
    return {
        select:      sinon.stub().returnsThis(),
        insert:      sinon.stub().returnsThis(),
        upsert:      sinon.stub().resolves({ error: null }),
        update:      sinon.stub().returnsThis(),
        delete:      sinon.stub().returnsThis(),
        eq:          sinon.stub().returnsThis(),
        or:          sinon.stub().returnsThis(),   // used by applyEnvironmentFilter in local mode
        in:          sinon.stub().resolves({ data: [], error: null }),
        maybeSingle: sinon.stub().resolves({ data: null, error: null }),
        order:       sinon.stub().resolves({ data: listData, error: null }),
        single:      sinon.stub().resolves({ data: singleData, error: singleError }),
        limit:       sinon.stub().returnsThis(),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────
describe('Repos Routes', function () {

    this.timeout(5000);

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
                //   call 1 — duplicate check → PGRST116 means no rows found (not a duplicate)
                //   call 2 — insert new row  → return the new DB row
                // Then collaborators and activity_log once each
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

            beforeEach(function () {
                stubAuth(FACULTY_ID, 'faculty');
                createProjectStub = sinon.stub(gitService, 'createProject')
                    .resolves(makeCreateProjectResult(FACULTY_ID));

                let repoCallCount = 0;
                sinon.stub(supabase, 'from').callsFake((table) => {
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

        // GET /my now:
        //   1. Queries repositories with environment filter (.or() in local mode)
        //   2. Queries annex_objects for db-authoritative sizes
        //   3. Enriches each entry with .repo, .git_url, .size, .updated
        //   4. Returns the enriched array directly

        // ── Student ──────────────────────────────────────────────────────────
        describe('Student accesses repository information', function () {

            beforeEach(function () {
                stubAuth(STUDENT_ID, 'student');

                sinon.stub(supabase, 'from').callsFake((table) => {
                    if (table === 'repositories') {
                        return makeChain({ listData: [MOCK_DB_ROW_STUDENT] });
                    }
                    if (table === 'annex_objects') {
                        // Return empty annex objects — size falls back to filesystem
                        return makeChain({ listData: [] });
                    }
                    return makeChain({});
                });

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

            it('should include repo and git_url fields so the student can clone', async function () {
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

            it('should return an empty array when the student has no repos', async function () {
                // Replace just the from stub to return empty list
                supabase.from.restore();
                sinon.stub(supabase, 'from').callsFake(() => makeChain({ listData: [] }));

                const res = await request(app)
                    .get('/api/repos/my')
                    .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

                assert.equal(res.status, 200);
                assert.deepEqual(res.body, [],
                    'Should return an empty array when no repos exist');
            });
        });

        // ── Faculty ──────────────────────────────────────────────────────────
        describe('Faculty accesses repository information', function () {

            beforeEach(function () {
                stubAuth(FACULTY_ID, 'faculty');

                sinon.stub(supabase, 'from').callsFake((table) => {
                    if (table === 'repositories') {
                        return makeChain({ listData: [MOCK_DB_ROW_FACULTY] });
                    }
                    if (table === 'annex_objects') {
                        return makeChain({ listData: [] });
                    }
                    return makeChain({});
                });

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
                const res = await request(app).get('/api/repos/my');
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

    // =========================================================================
    // REQ-08 & REQ-12 — Delete Repository   DELETE /api/repos/:id
    // =========================================================================
    describe('REQ-08 & REQ-12 | Delete Repository  DELETE /api/repos/:id', function () {

        // The delete route:
        //   1. Calls loadOwnedRepositoryInEnvironment → queries repositories with env filter
        //   2. Calls gitService.deleteProjectRepository to remove from filesystem
        //   3. Deletes the row from repositories table
        //   4. Logs to activity_log

        // ── Student ──────────────────────────────────────────────────────────
        describe('REQ-08 | Student removes a repository', function () {

            let deleteProjectStub;

            beforeEach(function () {
                stubAuth(STUDENT_ID, 'student');

                // Prevent real git delete
                deleteProjectStub = sinon.stub(gitService, 'deleteProjectRepository')
                    .resolves({ success: true });

                // Delete route DB call sequence:
                //   call 1 → repositories: loadOwnedRepositoryInEnvironment → return repo row
                //   call 2 → repositories: delete the row → success
                //   call 3 → activity_log: insert delete event
                let repoCallCount = 0;
                sinon.stub(supabase, 'from').callsFake((table) => {
                    if (table === 'repositories') {
                        repoCallCount++;
                        if (repoCallCount === 1) {
                            // Load repo for ownership check
                            return makeChain({ singleData: MOCK_DB_ROW_STUDENT });
                        }
                        // Delete the row — return no error
                        return makeChain({});
                    }
                    return makeChain({});
                });
            });

            it('should return 200 with { success: true } when student deletes their repo', async function () {
                const res = await request(app)
                    .delete(`/api/repos/${MOCK_DB_ROW_STUDENT.id}`)
                    .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

                assert.equal(res.status, 200,
                    `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
                assert.equal(res.body.success, true,
                    'Response body should have success: true');
            });

            it('should call gitService.deleteProjectRepository with the student userId and repo name', async function () {
                await request(app)
                    .delete(`/api/repos/${MOCK_DB_ROW_STUDENT.id}`)
                    .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

                assert.ok(deleteProjectStub.calledOnce,
                    'deleteProjectRepository should be called exactly once');
                const [calledUserId, calledName] = deleteProjectStub.firstCall.args;
                assert.equal(calledUserId, STUDENT_ID,
                    'deleteProjectRepository must receive the student\'s userId');
                assert.equal(calledName, MOCK_DB_ROW_STUDENT.name,
                    'deleteProjectRepository must receive the correct repo name');
            });

            it('should return 404 when the repo does not exist', async function () {
                // Override from stub — repo not found
                supabase.from.restore();
                sinon.stub(supabase, 'from').callsFake((table) => {
                    if (table === 'repositories') {
                        return makeChain({
                            singleData:  null,
                            singleError: { code: 'PGRST116', message: 'No rows found' }
                        });
                    }
                    return makeChain({});
                });

                const res = await request(app)
                    .delete(`/api/repos/nonexistent-repo-id`)
                    .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

                assert.equal(res.status, 404);
            });

            it('should return 403 when the student tries to delete another user\'s repo', async function () {
                // Override from stub — repo exists but belongs to a different user
                supabase.from.restore();
                sinon.stub(supabase, 'from').callsFake((table) => {
                    if (table === 'repositories') {
                        return makeChain({
                            singleData: { ...MOCK_DB_ROW_STUDENT, owner_id: 'some-other-user-id' }
                        });
                    }
                    return makeChain({});
                });

                const res = await request(app)
                    .delete(`/api/repos/${MOCK_DB_ROW_STUDENT.id}`)
                    .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

                assert.equal(res.status, 403,
                    'Should be forbidden from deleting another user\'s repository');
            });

            it('should return 401 when no auth token is provided', async function () {
                const res = await request(app)
                    .delete(`/api/repos/${MOCK_DB_ROW_STUDENT.id}`);

                assert.equal(res.status, 401,
                    'Unauthenticated delete requests must be rejected');
            });
        });

        // ── Faculty ──────────────────────────────────────────────────────────
        describe('REQ-12 | Faculty removes a repository', function () {

            let deleteProjectStub;

            beforeEach(function () {
                stubAuth(FACULTY_ID, 'faculty');

                deleteProjectStub = sinon.stub(gitService, 'deleteProjectRepository')
                    .resolves({ success: true });

                let repoCallCount = 0;
                sinon.stub(supabase, 'from').callsFake((table) => {
                    if (table === 'repositories') {
                        repoCallCount++;
                        if (repoCallCount === 1) {
                            return makeChain({ singleData: MOCK_DB_ROW_FACULTY });
                        }
                        return makeChain({});
                    }
                    return makeChain({});
                });
            });

            it('should return 200 with { success: true } when faculty deletes their repo', async function () {
                const res = await request(app)
                    .delete(`/api/repos/${MOCK_DB_ROW_FACULTY.id}`)
                    .set('Authorization', `Bearer ${FACULTY_TOKEN}`);

                assert.equal(res.status, 200,
                    `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
                assert.equal(res.body.success, true);
            });

            it('should call gitService.deleteProjectRepository with the faculty userId and repo name', async function () {
                await request(app)
                    .delete(`/api/repos/${MOCK_DB_ROW_FACULTY.id}`)
                    .set('Authorization', `Bearer ${FACULTY_TOKEN}`);

                assert.ok(deleteProjectStub.calledOnce);
                const [calledUserId, calledName] = deleteProjectStub.firstCall.args;
                assert.equal(calledUserId, FACULTY_ID,
                    'deleteProjectRepository must receive the faculty\'s userId');
                assert.equal(calledName, MOCK_DB_ROW_FACULTY.name,
                    'deleteProjectRepository must receive the correct repo name');
            });

            it('should return 403 when faculty tries to delete another user\'s repo', async function () {
                supabase.from.restore();
                sinon.stub(supabase, 'from').callsFake((table) => {
                    if (table === 'repositories') {
                        return makeChain({
                            singleData: { ...MOCK_DB_ROW_FACULTY, owner_id: 'some-other-user-id' }
                        });
                    }
                    return makeChain({});
                });

                const res = await request(app)
                    .delete(`/api/repos/${MOCK_DB_ROW_FACULTY.id}`)
                    .set('Authorization', `Bearer ${FACULTY_TOKEN}`);

                assert.equal(res.status, 403,
                    'Should be forbidden from deleting another user\'s repository');
            });

            it('should return 401 when no auth token is provided', async function () {
                const res = await request(app)
                    .delete(`/api/repos/${MOCK_DB_ROW_FACULTY.id}`);

                assert.equal(res.status, 401,
                    'Unauthenticated delete requests must be rejected');
            });
        });
    });
});
