# RTM Results - Executed Subset

Date: 2026-03-29
Branch: `ConnerReiter2`

This file is a conservative testing-results version of the RTM. It only marks cases as executed when we have direct evidence from an automated test run or a successful production build in this session.

## Test Runs Used

- Backend automated suite: `cd backend && npm test`
  - Result: `59 passing, 5 pending`
- Frontend production build: `cd frontend && npm run build`
  - Result: passed

## Executed RTM Coverage

| Requirement ID | RTM Case(s) Covered | Execution Evidence | Result | Notes |
| --- | --- | --- | --- | --- |
| B-01 | `REG-02`, `REG-03`, `REG-04`, `REG-05` | `backend/test/auth.test.js` registration success and validation cases | Pass (API) | Covers backend registration logic, not full registration-screen UI flow or confirmation email UI. |
| B-02 | `LOG-02`, `LOG-03`, `LOG-04`, `LOG-05` | `backend/test/auth.test.js` login success and invalid credential cases | Pass (API) | Covers backend login behavior for student/faculty credentials. `LOG-01` screen-navigation still needs manual UI verification. |
| B-03 | `CRE-01`, `CRE-02` | `backend/test/repos.test.js` create repository success + duplicate name checks | Pass (API) | Validates repository creation route, duplicate protection, auth guard, and input validation. |
| B-04 | `VIEW-01`, `VIEW-04`, `VIEW-05` | `backend/test/repos.test.js` `GET /api/repos/my` route coverage | Pass (API contract) | Confirms repository metadata retrieval for authenticated users. Student-vs-other-student access nuances in the RTM still need manual permission testing if they depend on page-level navigation rules. |
| ST-01 | `CLONE-01` | `backend/test/repos.test.js` repo info includes clone URL + `backend/test/gitService.test.js` Git HTTP URL contract | Pass (contract) | Verifies that students receive a valid clone URL. Does not prove an end-to-end local clone on a host machine. |
| ST-03 | `PULL-01` | `backend/test/gitService.test.js` pull URL contract for student repositories | Pass (contract) | Confirms URL contract for pull operations. End-to-end pull against a live repository still needs manual validation. |
| FAC-01 | `fCLONE-01` | `backend/test/repos.test.js` faculty repo info + `backend/test/gitService.test.js` faculty clone URL contract | Pass (contract) | Verifies valid faculty clone URL generation and exposure. |
| FAC-03 | `fPULL-01` | `backend/test/gitService.test.js` pull URL contract for faculty repositories | Pass (contract) | Confirms URL contract for pull operations. End-to-end live pull still pending. |
| UI-SUPP | Student Annex Help page | `cd frontend && npm run build` | Pass | Supplemental UI validation outside the original RTM. Confirms the new dedicated Annex Help page compiles in the production build. |

## Not Executed in This Pass

These RTM rows should remain unfilled or be marked pending until they are manually validated end-to-end:

- `REG-01`: registration screen navigation
- `REG-06`: password confirmation mismatch UI
- `REG-07`: confirmation email delivery
- `LOG-01`: login screen display
- `VIEW-02`, `VIEW-03`: cross-user access behavior as written in the RTM
- `ST-02`, `FAC-02`: live push behavior
- `ST-04`, `FAC-04`, `fDEL-02`: live delete behavior against storage/server

## Pending / Skipped Automated Tests

The backend suite reported `5 pending` tests. These were integration placeholders that self-skipped because `/usr/bin/git` was not available in this environment:

- repository creation integration placeholder
- student project creation Git URL placeholder
- faculty project creation Git URL placeholder
- student file push placeholder
- faculty file push placeholder

Those are not failures, but they are also not counted as executed RTM passes.

## Recommended RTM Update Approach

If you want to copy results back into the spreadsheet, the safest wording is:

- mark the rows above as `Pass` only when labeled `Pass (API)` or `Pass (contract)` in this file
- leave UI-only and end-to-end rows as `Pending` until manually tested on the deployed app/cluster
- note in the spreadsheet that this pass was backend/API-heavy with one frontend production-build validation
