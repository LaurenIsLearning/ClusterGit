/**
 * auth.test.js
 *
 * Mocha tests for backend/src/routes/auth.js
 *
 * Requirements covered:
 *  - REQ-01: Both users (student & faculty) should be able to create an account
 *  - REQ-02: Both users (student & faculty) should be able to login to their account
 *
 * Strategy:
 *  - supertest  : fires real HTTP requests against the Express app
 *  - sinon      : stubs supabase so no real network/DB calls are made
 *  - assert     : Node built-in strict assertions
 *
 * Auth middleware (requireAuth) calls supabase.auth.getUser(token).
 * The register and login routes do NOT use requireAuth, so no auth stub
 * is needed for those routes — only the Supabase auth method stubs below.
 */

import { strict as assert } from 'assert';
import sinon from 'sinon';
import request from 'supertest';

import app from '../src/app.js';
import { supabase } from '../src/utils/supabase.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test data
// ─────────────────────────────────────────────────────────────────────────────
const STUDENT_USER = {
    email:        'student_test@university.edu',
    password:     'Password123!',
    display_name: 'Test Student',
    role:         'student'
};

const FACULTY_USER = {
    email:        'faculty_test@university.edu',
    password:     'Password123!',
    display_name: 'Test Faculty',
    role:         'faculty'
};

const MOCK_USER_ID_STUDENT = 'aaaa-1111-student-uuid';
const MOCK_USER_ID_FACULTY = 'bbbb-2222-faculty-uuid';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Successful signUp response shape returned by Supabase */
function makeSignUpSuccess(userId, email) {
    return {
        data: {
            user:    { id: userId, email },
            session: null   // email confirmation blocks immediate session
        },
        error: null
    };
}

/** Successful signInWithPassword response shape returned by Supabase */
function makeSignInSuccess(userId, email) {
    return {
        data: {
            user: { id: userId, email },
            session: {
                access_token:  'mock-jwt-token',
                refresh_token: 'mock-refresh-token',
                expires_in:    3600
            }
        },
        error: null
    };
}

/**
 * Returns a chainable stub for supabase.from(table).
 * Covers the two table writes auth.js makes after register:
 *   supabase.from('user_profiles').upsert(...)
 *   supabase.from('activity_log').insert(...)
 */
function makeFromChain() {
    return {
        upsert:  sinon.stub().resolves({ error: null }),
        insert:  sinon.stub().resolves({ error: null }),
        select:  sinon.stub().returnsThis(),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────
describe('Auth Routes', function () {

    this.timeout(5000);

    let signUpStub;
    let signInStub;
    let fromStub;

    beforeEach(function () {
        signUpStub = sinon.stub(supabase.auth, 'signUp');
        signInStub = sinon.stub(supabase.auth, 'signInWithPassword');
        fromStub   = sinon.stub(supabase, 'from').returns(makeFromChain());
    });

    afterEach(function () {
        sinon.restore();
    });

    // =========================================================================
    // REQ-01 — Account Creation   POST /api/auth/register
    // =========================================================================
    describe('REQ-01 | Account Creation  POST /api/auth/register', function () {

        // ── Student ──────────────────────────────────────────────────────────
        describe('Student account creation', function () {

            it('should register a new student and return 200', async function () {
                signUpStub.resolves(makeSignUpSuccess(MOCK_USER_ID_STUDENT, STUDENT_USER.email));

                const res = await request(app)
                    .post('/api/auth/register')
                    .send(STUDENT_USER)
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 200,
                    `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
                assert.ok(res.body.user,
                    'Response should contain a user object');
                assert.equal(res.body.user.email, STUDENT_USER.email);
            });

            it('should call supabase.auth.signUp with the student email and password', async function () {
                signUpStub.resolves(makeSignUpSuccess(MOCK_USER_ID_STUDENT, STUDENT_USER.email));

                await request(app)
                    .post('/api/auth/register')
                    .send(STUDENT_USER)
                    .set('Content-Type', 'application/json');

                assert.ok(signUpStub.calledOnce, 'signUp should be called exactly once');
                const arg = signUpStub.firstCall.args[0];
                assert.equal(arg.email,    STUDENT_USER.email);
                assert.equal(arg.password, STUDENT_USER.password);
            });

            it('should write the student role to user_profiles after registration', async function () {
                signUpStub.resolves(makeSignUpSuccess(MOCK_USER_ID_STUDENT, STUDENT_USER.email));

                await request(app)
                    .post('/api/auth/register')
                    .send(STUDENT_USER)
                    .set('Content-Type', 'application/json');

                assert.ok(fromStub.called, 'supabase.from() should be called');
                const tables = fromStub.args.map(a => a[0]);
                assert.ok(tables.includes('user_profiles'),
                    'user_profiles table should be written during student registration');
            });
        });

        // ── Faculty ──────────────────────────────────────────────────────────
        describe('Faculty account creation', function () {

            it('should register a new faculty member and return 200', async function () {
                signUpStub.resolves(makeSignUpSuccess(MOCK_USER_ID_FACULTY, FACULTY_USER.email));

                const res = await request(app)
                    .post('/api/auth/register')
                    .send(FACULTY_USER)
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 200,
                    `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
                assert.ok(res.body.user);
                assert.equal(res.body.user.email, FACULTY_USER.email);
            });

            it('should call supabase.auth.signUp with the faculty email and password', async function () {
                signUpStub.resolves(makeSignUpSuccess(MOCK_USER_ID_FACULTY, FACULTY_USER.email));

                await request(app)
                    .post('/api/auth/register')
                    .send(FACULTY_USER)
                    .set('Content-Type', 'application/json');

                assert.ok(signUpStub.calledOnce);
                const arg = signUpStub.firstCall.args[0];
                assert.equal(arg.email,    FACULTY_USER.email);
                assert.equal(arg.password, FACULTY_USER.password);
            });

            it('should write the faculty role to user_profiles after registration', async function () {
                signUpStub.resolves(makeSignUpSuccess(MOCK_USER_ID_FACULTY, FACULTY_USER.email));

                await request(app)
                    .post('/api/auth/register')
                    .send(FACULTY_USER)
                    .set('Content-Type', 'application/json');

                assert.ok(fromStub.called);
                const tables = fromStub.args.map(a => a[0]);
                assert.ok(tables.includes('user_profiles'),
                    'user_profiles table should be written during faculty registration');
            });
        });

        // ── Input validation ─────────────────────────────────────────────────
        describe('Input validation', function () {

            it('should return 400 when email is missing', async function () {
                const res = await request(app)
                    .post('/api/auth/register')
                    .send({ password: 'Password123!' })
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 400);
                assert.ok(res.body.error?.message,
                    'Should return a descriptive error message');
            });

            it('should return 400 when email is not a valid school email', async function () {
                const res = await request(app)
                    .post('/api/auth/register')
                    .send({ email: 'someone@gmail.com', password: 'Password123!' })
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 400);
                assert.match(res.body.error?.message || '', /school email/i);
            });

            it('should return 400 when password is missing', async function () {
                const res = await request(app)
                    .post('/api/auth/register')
                    .send({ email: 'someone@university.edu' })
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 400);
                assert.ok(res.body.error?.message);
            });

            it('should return 400 when password is shorter than 6 characters', async function () {
                const res = await request(app)
                    .post('/api/auth/register')
                    .send({ email: 'someone@university.edu', password: '12345' })
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 400);
                assert.match(res.body.error?.message || '', /at least 6/i);
            });

            it('should return 400 when Supabase reports a registration error', async function () {
                signUpStub.resolves({
                    data:  null,
                    error: { message: 'User already registered' }
                });

                const res = await request(app)
                    .post('/api/auth/register')
                    .send(STUDENT_USER)
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 400);
                assert.ok(res.body.error?.message);
            });
        });
    });

    // =========================================================================
    // REQ-02 — Login   POST /api/auth/login
    // =========================================================================
    describe('REQ-02 | Login  POST /api/auth/login', function () {

        // ── Student ──────────────────────────────────────────────────────────
        describe('Student login', function () {

            it('should return 200 with a session token when student logs in', async function () {
                signInStub.resolves(makeSignInSuccess(MOCK_USER_ID_STUDENT, STUDENT_USER.email));

                const res = await request(app)
                    .post('/api/auth/login')
                    .send({ email: STUDENT_USER.email, password: STUDENT_USER.password })
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 200,
                    `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
                assert.ok(res.body.session,
                    'Response should contain a session object');
                assert.ok(res.body.session.access_token,
                    'Session should include an access_token');
            });

            it('should call signInWithPassword with the correct student credentials', async function () {
                signInStub.resolves(makeSignInSuccess(MOCK_USER_ID_STUDENT, STUDENT_USER.email));

                await request(app)
                    .post('/api/auth/login')
                    .send({ email: STUDENT_USER.email, password: STUDENT_USER.password })
                    .set('Content-Type', 'application/json');

                assert.ok(signInStub.calledOnce);
                const arg = signInStub.firstCall.args[0];
                assert.equal(arg.email,    STUDENT_USER.email);
                assert.equal(arg.password, STUDENT_USER.password);
            });
        });

        // ── Faculty ──────────────────────────────────────────────────────────
        describe('Faculty login', function () {

            it('should return 200 with a session token when faculty logs in', async function () {
                signInStub.resolves(makeSignInSuccess(MOCK_USER_ID_FACULTY, FACULTY_USER.email));

                const res = await request(app)
                    .post('/api/auth/login')
                    .send({ email: FACULTY_USER.email, password: FACULTY_USER.password })
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 200,
                    `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
                assert.ok(res.body.session);
                assert.ok(res.body.session.access_token);
            });

            it('should call signInWithPassword with the correct faculty credentials', async function () {
                signInStub.resolves(makeSignInSuccess(MOCK_USER_ID_FACULTY, FACULTY_USER.email));

                await request(app)
                    .post('/api/auth/login')
                    .send({ email: FACULTY_USER.email, password: FACULTY_USER.password })
                    .set('Content-Type', 'application/json');

                assert.ok(signInStub.calledOnce);
                const arg = signInStub.firstCall.args[0];
                assert.equal(arg.email,    FACULTY_USER.email);
                assert.equal(arg.password, FACULTY_USER.password);
            });
        });

        // ── Input validation ─────────────────────────────────────────────────
        describe('Input validation', function () {

            it('should return 400 when email is missing', async function () {
                const res = await request(app)
                    .post('/api/auth/login')
                    .send({ password: 'Password123!' })
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 400);
                assert.ok(res.body.error?.message);
            });

            it('should return 400 when email is not a valid school email', async function () {
                const res = await request(app)
                    .post('/api/auth/login')
                    .send({ email: 'someone@gmail.com', password: 'Password123!' })
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 400);
                assert.match(res.body.error?.message || '', /school email/i);
            });

            it('should return 400 when password is missing', async function () {
                const res = await request(app)
                    .post('/api/auth/login')
                    .send({ email: 'someone@university.edu' })
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 400);
                assert.ok(res.body.error?.message);
            });

            it('should return 401 when Supabase reports invalid credentials', async function () {
                signInStub.resolves({
                    data:  null,
                    error: { message: 'Invalid login credentials' }
                });

                const res = await request(app)
                    .post('/api/auth/login')
                    .send({ email: STUDENT_USER.email, password: 'wrongpassword' })
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 401);
                assert.ok(res.body.error?.message);
            });

            it('should return 401 for a completely unknown user', async function () {
                signInStub.resolves({
                    data:  null,
                    error: { message: 'Invalid login credentials' }
                });

                const res = await request(app)
                    .post('/api/auth/login')
                    .send({ email: 'nobody@university.edu', password: 'Password123!' })
                    .set('Content-Type', 'application/json');

                assert.equal(res.status, 401);
            });
        });
    });
});
