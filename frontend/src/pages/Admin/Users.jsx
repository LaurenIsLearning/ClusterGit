import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import adminService from '../../services/adminService';

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** exp);
  return `${value.toFixed(value >= 10 || exp === 0 ? 0 : 1)} ${units[exp]}`;
}

function formatDate(value) {
  if (!value) return 'never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toLocaleString();
}

function normalizeGitPath(path) {
  if (!path) return '';
  return path.replace(/\\/g, '/');
}

function RepoFilesTable({ files }) {
  if (!files.length) {
    return <div className="users-empty-subtle">no tracked files</div>;
  }

  return (
    <div className="users-files-table-wrapper">
      <table className="users-files-table">
        <thead>
          <tr>
            <th>file</th>
            <th>size</th>
            <th>last modified</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={`${file.path}-${file.last_modified || 'unknown'}`}>
              <td>{file.path || 'unknown'}</td>
              <td>{formatBytes(file.size_bytes || 0)}</td>
              <td>{formatDate(file.last_modified)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [environmentKey, setEnvironmentKey] = useState('unknown');
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [copiedRepoId, setCopiedRepoId] = useState(null);
  const [inspectState, setInspectState] = useState({});
  const [createState, setCreateState] = useState({
    open: false,
    email: '',
    password: '',
    displayName: '',
    submitting: false,
    error: '',
  });
  const [quotaState, setQuotaState] = useState({
    open: false,
    userId: '',
    email: '',
    quotaMb: '',
    submitting: false,
    error: '',
  });

  const selectedUserSummary = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [users, selectedUserId],
  );

  useEffect(() => {
    let mounted = true;

    const loadUsers = async () => {
      try {
        setLoadingUsers(true);
        setUsersError('');
        const data = await adminService.listUsers();
        if (!mounted) return;

        const nextUsers = Array.isArray(data?.users) ? data.users : [];
        setUsers(nextUsers);
        setEnvironmentKey(data?.environment_key || 'unknown');

        if (nextUsers.length > 0) {
          setSelectedUserId((current) => current || nextUsers[0].id);
        } else {
          setSelectedUserId(null);
        }
      } catch (error) {
        if (!mounted) return;
        setUsers([]);
        setSelectedUserId(null);
        setUsersError(error.message || 'failed to load users');
      } finally {
        if (mounted) setLoadingUsers(false);
      }
    };

    loadUsers();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedUserId) {
      setSelectedUser(null);
      setDetailError('');
      return;
    }

    let mounted = true;

    const loadUserDetail = async () => {
      try {
        setLoadingDetail(true);
        setDetailError('');
        const data = await adminService.getUserDetail(selectedUserId);
        if (!mounted) return;
        setSelectedUser(data);
      } catch (error) {
        if (!mounted) return;
        setSelectedUser(null);
        setDetailError(error.message || 'failed to load user detail');
      } finally {
        if (mounted) setLoadingDetail(false);
      }
    };

    loadUserDetail();
    return () => {
      mounted = false;
    };
  }, [selectedUserId]);

  useEffect(() => {
    if (!copiedRepoId) return undefined;
    const timeout = setTimeout(() => setCopiedRepoId(null), 1800);
    return () => clearTimeout(timeout);
  }, [copiedRepoId]);

  const refreshUsers = async (preferredSelectedUserId = selectedUserId) => {
    setLoadingUsers(true);
    setUsersError('');
    try {
      const data = await adminService.listUsers();
      const nextUsers = Array.isArray(data?.users) ? data.users : [];
      setUsers(nextUsers);
      setEnvironmentKey(data?.environment_key || 'unknown');

      if (nextUsers.length === 0) {
        setSelectedUserId(null);
        return;
      }

      const preferredExists = nextUsers.some((user) => user.id === preferredSelectedUserId);
      setSelectedUserId(preferredExists ? preferredSelectedUserId : nextUsers[0].id);
    } catch (error) {
      setUsersError(error.message || 'failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleCopyCloneUrl = async (repo) => {
    const cloneUrl = repo.clone_url || repo.cloneUrl || '';
    if (!cloneUrl) return;

    try {
      await navigator.clipboard.writeText(cloneUrl);
      setCopiedRepoId(repo.id);
    } catch (error) {
      setDetailError(error.message || 'failed to copy clone url');
    }
  };

  const handleInspectRepo = async (repoId) => {
    setInspectState((current) => ({
      ...current,
      [repoId]: { loading: true, error: '', data: null },
    }));

    try {
      const data = await adminService.inspectRepo(repoId);
      setInspectState((current) => ({
        ...current,
        [repoId]: { loading: false, error: '', data },
      }));
    } catch (error) {
      setInspectState((current) => ({
        ...current,
        [repoId]: { loading: false, error: error.message || 'failed to inspect repo', data: null },
      }));
    }
  };

  const openCreateModal = () => {
    setCreateState({
      open: true,
      email: '',
      password: '',
      displayName: '',
      submitting: false,
      error: '',
    });
  };

  const closeCreateModal = () => {
    setCreateState((current) => ({
      ...current,
      open: false,
      submitting: false,
      error: '',
    }));
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setCreateState((current) => ({ ...current, submitting: true, error: '' }));

    try {
      const created = await adminService.createStudent({
        email: createState.email.trim(),
        password: createState.password,
        display_name: createState.displayName.trim(),
      });

      closeCreateModal();
      await refreshUsers(created?.user?.id || selectedUserId);
    } catch (error) {
      setCreateState((current) => ({
        ...current,
        submitting: false,
        error: error.message || 'failed to create user',
      }));
    }
  };

  const openQuotaModal = (user) => {
    setQuotaState({
      open: true,
      userId: user.id,
      email: user.email || '',
      quotaMb: user.storage_quota_mb != null ? String(user.storage_quota_mb) : '',
      submitting: false,
      error: '',
    });
  };

  const closeQuotaModal = () => {
    setQuotaState({
      open: false,
      userId: '',
      email: '',
      quotaMb: '',
      submitting: false,
      error: '',
    });
  };

  const handleSaveQuota = async (event) => {
    event.preventDefault();
    setQuotaState((current) => ({ ...current, submitting: true, error: '' }));

    try {
      await adminService.setStorageQuota(quotaState.userId, Number(quotaState.quotaMb));
      closeQuotaModal();
      await refreshUsers(quotaState.userId);
    } catch (error) {
      setQuotaState((current) => ({
        ...current,
        submitting: false,
        error: error.message || 'failed to update quota',
      }));
    }
  };

  const handleResetQuota = async () => {
    setQuotaState((current) => ({ ...current, submitting: true, error: '' }));

    try {
      await adminService.resetStorageQuota(quotaState.userId);
      closeQuotaModal();
      await refreshUsers(quotaState.userId);
    } catch (error) {
      setQuotaState((current) => ({
        ...current,
        submitting: false,
        error: error.message || 'failed to reset quota',
      }));
    }
  };

  return (
    <DashboardLayout>
      <div className="users-page">
        <div className="users-header">
          <div>
            <h1>users</h1>
            <p>review student accounts, quotas, repos, and file metadata</p>
          </div>
          <div className="users-header-actions">
            <span className="users-environment-pill">env: {environmentKey}</span>
            <button type="button" className="users-primary-btn" onClick={openCreateModal}>
              create student
            </button>
          </div>
        </div>

        <div className="users-grid">
          <section className="users-panel users-list-panel">
            <div className="users-panel-header">
              <h2>students</h2>
            </div>

            {loadingUsers ? <div className="users-empty">loading users...</div> : null}
            {!loadingUsers && usersError ? <div className="users-error">{usersError}</div> : null}
            {!loadingUsers && !usersError && users.length === 0 ? (
              <div className="users-empty">no users found</div>
            ) : null}

            {!loadingUsers && !usersError && users.length > 0 ? (
              <div className="users-list">
                {users.map((user) => {
                  const isSelected = user.id === selectedUserId;
                  const isReady = Boolean(user.ready_for_review || user.has_review_request);

                  return (
                    <button
                      key={user.id}
                      type="button"
                      className={`users-list-item${isSelected ? ' is-selected' : ''}${isReady ? ' is-ready' : ''}`}
                      onClick={() => setSelectedUserId(user.id)}
                    >
                      <div className="users-list-item-top">
                        <strong>{user.display_name || user.email || 'unnamed user'}</strong>
                        {isReady ? <span className="users-ready-pill">ready for review</span> : null}
                      </div>
                      <div className="users-list-item-meta">{user.email}</div>
                      <div className="users-list-item-meta">
                        quota: {user.storage_quota_mb ?? 0} mb
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section className="users-panel users-detail-panel">
            {!selectedUserId ? (
              <div className="users-empty">select a user to see profile and repos</div>
            ) : null}

            {selectedUserId && loadingDetail ? <div className="users-empty">loading user details...</div> : null}
            {selectedUserId && !loadingDetail && detailError ? <div className="users-error">{detailError}</div> : null}

            {selectedUserId && !loadingDetail && !detailError && selectedUser ? (
              <>
                <div className="users-panel-header users-detail-header">
                  <div>
                    <h2>{selectedUser.profile?.display_name || selectedUser.profile?.email || 'user profile'}</h2>
                    <p>{selectedUser.profile?.email || 'no email available'}</p>
                  </div>
                  {selectedUserSummary ? (
                    <button
                      type="button"
                      className="users-secondary-btn"
                      onClick={() => openQuotaModal(selectedUserSummary)}
                    >
                      set quota
                    </button>
                  ) : null}
                </div>

                <div className="users-profile-grid">
                  <div className="users-stat-card">
                    <span>quota</span>
                    <strong>{selectedUser.profile?.storage_quota_mb ?? 0} mb</strong>
                  </div>
                  <div className="users-stat-card">
                    <span>used</span>
                    <strong>{formatBytes(selectedUser.profile?.storage_used_bytes ?? 0)}</strong>
                  </div>
                  <div className="users-stat-card">
                    <span>created</span>
                    <strong>{formatDate(selectedUser.profile?.created_at)}</strong>
                  </div>
                  <div className="users-stat-card">
                    <span>review status</span>
                    <strong>
                      {selectedUser.profile?.ready_for_review || selectedUser.profile?.has_review_request
                        ? 'ready'
                        : 'not requested'}
                    </strong>
                  </div>
                </div>

                <div className="users-repos-section">
                  <div className="users-section-heading">
                    <h3>repositories</h3>
                    <span>{selectedUser.repositories?.length || 0} total</span>
                  </div>

                  {selectedUser.repositories?.length ? (
                    selectedUser.repositories.map((repo) => {
                      const inspect = inspectState[repo.id] || {};
                      const files = Array.isArray(repo.files) ? repo.files : [];

                      return (
                        <article key={repo.id} className="users-repo-card">
                          <div className="users-repo-header">
                            <div>
                              <h4>{repo.name || 'untitled repo'}</h4>
                              <p>{repo.description || 'no description'}</p>
                            </div>
                            <div className="users-repo-actions">
                              <button
                                type="button"
                                className="users-secondary-btn"
                                onClick={() => handleCopyCloneUrl(repo)}
                              >
                                {copiedRepoId === repo.id ? 'copied' : 'copy clone url'}
                              </button>
                              <button
                                type="button"
                                className="users-secondary-btn"
                                onClick={() => handleInspectRepo(repo.id)}
                              >
                                inspect repo
                              </button>
                            </div>
                          </div>

                          <div className="users-repo-meta">
                            <span>path: {normalizeGitPath(repo.repo_path || repo.path || '') || 'unknown'}</span>
                            <span>updated: {formatDate(repo.updated_at)}</span>
                            <span>files: {files.length}</span>
                          </div>

                          <RepoFilesTable files={files} />

                          {inspect.loading ? <div className="users-empty-subtle">inspecting repo...</div> : null}
                          {inspect.error ? <div className="users-error-subtle">{inspect.error}</div> : null}
                          {inspect.data ? (
                            <div className="users-inspect-box">
                              <div>git path: {normalizeGitPath(inspect.data.repo_path || '') || 'unknown'}</div>
                              <div>bare repo: {inspect.data.bare_exists ? 'yes' : 'no'}</div>
                              <div>annex branch: {inspect.data.git_annex_exists ? 'yes' : 'no'}</div>
                              <div>head ref: {inspect.data.head_ref || 'unknown'}</div>
                            </div>
                          ) : null}
                        </article>
                      );
                    })
                  ) : (
                    <div className="users-empty-subtle">this user has no repositories yet</div>
                  )}
                </div>
              </>
            ) : null}
          </section>
        </div>

        {createState.open ? (
          <div className="users-modal-backdrop" role="presentation" onClick={closeCreateModal}>
            <div className="users-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <div className="users-modal-header">
                <h2>create student</h2>
                <button type="button" className="users-close-btn" onClick={closeCreateModal}>
                  close
                </button>
              </div>

              <form className="users-form" onSubmit={handleCreateUser}>
                <label>
                  <span>email</span>
                  <input
                    type="email"
                    value={createState.email}
                    onChange={(event) => setCreateState((current) => ({ ...current, email: event.target.value }))}
                    required
                  />
                </label>

                <label>
                  <span>password</span>
                  <input
                    type="password"
                    value={createState.password}
                    onChange={(event) => setCreateState((current) => ({ ...current, password: event.target.value }))}
                    required
                  />
                </label>

                <label>
                  <span>display name</span>
                  <input
                    type="text"
                    value={createState.displayName}
                    onChange={(event) => setCreateState((current) => ({ ...current, displayName: event.target.value }))}
                  />
                </label>

                {createState.error ? <div className="users-error">{createState.error}</div> : null}

                <div className="users-modal-actions">
                  <button type="button" className="users-secondary-btn" onClick={closeCreateModal}>
                    cancel
                  </button>
                  <button type="submit" className="users-primary-btn" disabled={createState.submitting}>
                    {createState.submitting ? 'creating...' : 'create user'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {quotaState.open ? (
          <div className="users-modal-backdrop" role="presentation" onClick={closeQuotaModal}>
            <div className="users-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <div className="users-modal-header">
                <h2>update quota</h2>
                <button type="button" className="users-close-btn" onClick={closeQuotaModal}>
                  close
                </button>
              </div>

              <form className="users-form" onSubmit={handleSaveQuota}>
                <label>
                  <span>student</span>
                  <input type="text" value={quotaState.email} readOnly />
                </label>

                <label>
                  <span>quota mb</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={quotaState.quotaMb}
                    onChange={(event) => setQuotaState((current) => ({ ...current, quotaMb: event.target.value }))}
                    required
                  />
                </label>

                {quotaState.error ? <div className="users-error">{quotaState.error}</div> : null}

                <div className="users-modal-actions">
                  <button
                    type="button"
                    className="users-secondary-btn"
                    onClick={handleResetQuota}
                    disabled={quotaState.submitting}
                  >
                    reset
                  </button>
                  <button type="submit" className="users-primary-btn" disabled={quotaState.submitting}>
                    {quotaState.submitting ? 'saving...' : 'save quota'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
