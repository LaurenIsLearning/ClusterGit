# ClusterGit Metadata Contract

This document maps each metadata field to its source and write path in the current codebase.

## repositories

| column | source | writer | status |
| --- | --- | --- | --- |
| id | Supabase default UUID | DB default | implemented |
| name | API body `name` (validated) | `backend/src/routes/repos.js` (`POST /api/repos/create`) | implemented |
| owner_id | `req.user.id` from auth token | `backend/src/routes/repos.js` | implemented |
| created_at | Supabase default timestamp | DB default | implemented |
| is_public | API body `is_public` (default `false`) | `backend/src/routes/repos.js` | implemented |
| git_annex_uuid | `gitService.createProject().annexUuid` | `backend/src/routes/repos.js` | implemented |

## user_profiles

| column | source | writer | status |
| --- | --- | --- | --- |
| user_id | `supabase.auth.signUp()` user id | `backend/src/routes/auth.js` (`POST /api/auth/register`) | implemented |
| role | API body `role` (default `student`) | `backend/src/routes/auth.js` | implemented |
| created_at | Supabase default timestamp | DB default | implemented |
| display_name | API body `display_name` or email prefix fallback | `backend/src/routes/auth.js` | implemented |

## push_events

| column | source | writer | status |
| --- | --- | --- | --- |
| id | Supabase default UUID | DB default | implemented |
| repo_id | Route param `repo_id` | `backend/src/routes/commits.js` (`POST /api/commits/:repo_id`) | implemented |
| pusher_id | `req.user.id` from auth token | `backend/src/routes/commits.js` | implemented |
| pushed_at | Supabase default timestamp | DB default | implemented |
| from_ref | API body `from_ref` | `backend/src/routes/commits.js` | implemented |
| to_ref | API body `to_ref` (fallback `branch`) | `backend/src/routes/commits.js` | implemented |
| commit_count | API body `commit_count` (fallback `file_count`, fallback `1`) | `backend/src/routes/commits.js` | implemented |
| hook_source | API body `hook_source` (default `api`) | `backend/src/routes/commits.js` | implemented |

## pull_requests

| column | source | writer | status |
| --- | --- | --- | --- |
| id | Supabase default UUID | DB default | pending |
| repo_id | PR create payload | not implemented yet | pending |
| author_id | PR create payload / `req.user.id` | not implemented yet | pending |
| title | PR create payload | not implemented yet | pending |
| description | PR create payload | not implemented yet | pending |
| source_branch | PR create payload | not implemented yet | pending |
| target_branch | PR create payload | not implemented yet | pending |
| status | PR workflow logic (`open`, `closed`, `merged`) | not implemented yet | pending |
| created_at | Supabase default timestamp | DB default | pending |
| merged_at | set on merge action | not implemented yet | pending |

## commits

| column | source | writer | status |
| --- | --- | --- | --- |
| id | Supabase default UUID | DB default | implemented |
| repo_id | Route param `repo_id` | `backend/src/routes/commits.js` | implemented |
| git_commit_hash | API body `git_commit_hash` (fallback `commit_hash`) | `backend/src/routes/commits.js` | implemented |
| author_id | `req.user.id` from auth token | `backend/src/routes/commits.js` | implemented |
| message | API body `message` (default `Commit recorded`) | `backend/src/routes/commits.js` | implemented |
| branch | API body `branch` (fallback `to_ref`, default `main`) | `backend/src/routes/commits.js` | implemented |
| is_merge | API body `is_merge` (boolean) | `backend/src/routes/commits.js` | implemented |
| annex_key | API body `annex_key` (fallback `annex_uuid`) | `backend/src/routes/commits.js` | implemented |

## collaborators

| column | source | writer | status |
| --- | --- | --- | --- |
| repo_id | inserted repository id | `backend/src/routes/repos.js` | implemented |
| user_id | repository owner (`req.user.id`) | `backend/src/routes/repos.js` | implemented |
| access_level | default `owner` for creator | `backend/src/routes/repos.js` | implemented |
| added_at | Supabase default timestamp | DB default | implemented |

## annex_objects

| column | source | writer | status |
| --- | --- | --- | --- |
| id | Supabase default UUID | DB default | implemented |
| repo_id | Route param `repo_id` | `backend/src/routes/commits.js` | implemented |
| annex_key | API body `annex_key` (fallback `annex_uuid`) | `backend/src/routes/commits.js` | implemented |
| size_bytes | API body `size_bytes` (default `0`) | `backend/src/routes/commits.js` | implemented |
| storage_backend | API body `storage_backend` (default `git-annex`) | `backend/src/routes/commits.js` | implemented |
| created_at | Supabase default timestamp | DB default | implemented |

## activity_log

| column | source | writer | status |
| --- | --- | --- | --- |
| id | Supabase default UUID | DB default | implemented |
| user_id | authenticated user id or signed-up user id | `auth.js`, `repos.js`, `commits.js` | implemented |
| repo_id | repo context when available | `repos.js`, `commits.js` | implemented |
| event_type | route-specific event name | `auth.js`, `repos.js`, `commits.js` | implemented |
| detail | route-specific text detail | `auth.js`, `repos.js`, `commits.js` | implemented |
| created_at | Supabase default timestamp | DB default | implemented |

## Notes

- Any DB defaults listed above must exist in Supabase schema to avoid null insert errors.
- `pull_requests` has no route implementation yet; table exists but write path is pending.
- Some write operations intentionally log-and-continue for non-critical metadata to avoid failing primary user actions.
