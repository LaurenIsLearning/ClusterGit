import { useEffect, useMemo, useState } from 'react';
import adminService from '../../services/adminService';
import { userService } from '../../services/userService';

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

  const visibleFiles = files.slice(0, 250);
  const hiddenCount = files.length - visibleFiles.length;

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
          {visibleFiles.map((file) => (
            <tr key={`${file.path}-${file.last_modified || 'unknown'}`}>
              <td>{file.path || 'unknown'}</td>
              <td>{formatBytes(file.size_bytes || 0)}</td>
              <td>{formatDate(file.last_modified)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hiddenCount > 0 ? (
        <div className="users-empty-subtle">
          Showing first 250 files. {hiddenCount} more file{hiddenCount === 1 ? '' : 's'} tracked.
        </div>
      ) : null}
    </div>
  );
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
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
    role: 'student',
    quotaMb: '20480',
    submitting: false,
    error: '',
  });
  const [editState, setEditState] = useState({
    open: false,
    userId: '',
    email: '',
    displayName: '',
    role: 'student',
    quotaMb: '',
    usedBytes: '',
    lastActiveAt: '',
    submitting: false,
    error: '',
  });
  const [deleteState, setDeleteState] = useState({
    open: false,
    userId: '',
    label: '',
    deleting: false,
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

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => {
      const displayName = String(user.display_name || user.name || '').toLowerCase();
      const email = String(user.email || '').toLowerCase();
      const role = String(user.role || '').toLowerCase();
      return displayName.includes(query) || email.includes(query) || role.includes(query);
    });
  }, [users, search]);

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
      role: 'student',
      quotaMb: '20480',
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

  const openEditModal = (user) => {
    setEditState({
      open: true,
      userId: user.id,
      email: user.email || '',
      displayName: user.display_name || user.name || '',
      role: user.role || 'student',
      quotaMb: user.storage_quota_mb != null ? String(user.storage_quota_mb) : '0',
      usedBytes: String(user.storage_used_bytes ?? 0),
      lastActiveAt: user.last_active_at ? new Date(user.last_active_at).toISOString().slice(0, 16) : '',
      submitting: false,
      error: '',
    });
  };

  const closeEditModal = () => {
    setEditState({
      open: false,
      userId: '',
      email: '',
      displayName: '',
      role: 'student',
      quotaMb: '',
      usedBytes: '',
      lastActiveAt: '',
      submitting: false,
      error: '',
    });
  };

  const openDeleteModal = (user) => {
    setDeleteState({
      open: true,
      userId: user.id,
      label: user.display_name || user.name || user.email || 'this user',
      deleting: false,
      error: '',
    });
  };

  const closeDeleteModal = () => {
    setDeleteState({
      open: false,
      userId: '',
      label: '',
      deleting: false,
      error: '',
    });
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setCreateState((current) => ({ ...current, submitting: true, error: '' }));

    try {
      const created = await userService.createUser({
        email: createState.email.trim(),
        password: createState.password,
        display_name: createState.displayName.trim(),
        role: createState.role,
        storage_quota_bytes: Math.round(Number(createState.quotaMb || 0) * 1024 * 1024),
      });

      closeCreateModal();
      await refreshUsers(created?.user_id || created?.id || selectedUserId);
    } catch (error) {
      setCreateState((current) => ({
        ...current,
        submitting: false,
        error: error.message || 'failed to create user',
      }));
    }
  };

  const handleEditUser = async (event) => {
    event.preventDefault();
    setEditState((current) => ({ ...current, submitting: true, error: '' }));

    try {
      await userService.updateUser(editState.userId, {
        display_name: editState.displayName.trim() || null,
        role: editState.role,
        storage_quota_bytes: Math.round(Number(editState.quotaMb || 0) * 1024 * 1024),
        storage_used_bytes: Number(editState.usedBytes || 0),
        last_active_at: editState.lastActiveAt || null,
      });

      closeEditModal();
      await refreshUsers(editState.userId);
      if (editState.userId === selectedUserId) {
        const detail = await adminService.getUserDetail(editState.userId);
        setSelectedUser(detail);
      }
    } catch (error) {
      setEditState((current) => ({
        ...current,
        submitting: false,
        error: error.message || 'failed to update user',
      }));
    }
  };

  const handleDeleteUser = async () => {
    setDeleteState((current) => ({ ...current, deleting: true, error: '' }));

    try {
      const deletedUserId = deleteState.userId;
      await userService.deleteUser(deletedUserId);
      closeDeleteModal();
      const fallbackUser = users.find((user) => user.id !== deletedUserId);
      await refreshUsers(fallbackUser?.id || null);
      if (selectedUserId === deletedUserId) {
        setSelectedUser(null);
      }
    } catch (error) {
      setDeleteState((current) => ({
        ...current,
        deleting: false,
        error: error.message || 'failed to delete user',
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
      <div className="users-page">
        <div className="users-header">
          <div>
            <h1>Users</h1>
            <p>Review student accounts, storage quotas, repositories, and file metadata.</p>
          </div>
          <div className="users-header-actions">
            <span className="users-environment-pill">Environment: {environmentKey}</span>
            <button type="button" className="users-primary-btn" onClick={openCreateModal}>
              Create Student
            </button>
          </div>
        </div>

        <div className="users-grid">
          <section className="users-panel users-list-panel">
            <div className="users-panel-header">
              <h2>Students</h2>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="users-search-input"
                placeholder="Search users..."
              />
            </div>

            {loadingUsers ? <div className="users-empty">Loading users...</div> : null}
            {!loadingUsers && usersError ? <div className="users-error">{usersError}</div> : null}
            {!loadingUsers && !usersError && users.length === 0 ? (
              <div className="users-empty">No users found.</div>
            ) : null}

            {!loadingUsers && !usersError && filteredUsers.length > 0 ? (
              <div className="users-list">
                {filteredUsers.map((user) => {
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
                        <strong>{user.display_name || user.email || 'Unnamed User'}</strong>
                        {isReady ? <span className="users-ready-pill">Ready for Review</span> : null}
                      </div>
                      <div className="users-list-item-meta">{user.email}</div>
                      <div className="users-list-item-meta">
                        Quota: {user.storage_quota_mb ?? 0} MB
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section className="users-panel users-detail-panel">
            {!selectedUserId ? (
              <div className="users-empty">Select a user to view profile details and repositories.</div>
            ) : null}

            {selectedUserId && loadingDetail ? <div className="users-empty">Loading user details...</div> : null}
            {selectedUserId && !loadingDetail && detailError ? <div className="users-error">{detailError}</div> : null}

            {selectedUserId && !loadingDetail && !detailError && selectedUser ? (
              <>
                <div className="users-panel-header users-detail-header">
                  <div>
                    <h2>{selectedUser.profile?.display_name || selectedUser.profile?.email || 'User Profile'}</h2>
                    <p>{selectedUser.profile?.email || 'No email available'}</p>
                  </div>
                  <div className="users-detail-actions">
                    {selectedUserSummary ? (
                      <>
                        <button
                          type="button"
                          className="users-secondary-btn"
                          onClick={() => openEditModal(selectedUserSummary)}
                        >
                          Edit User
                        </button>
                        <button
                          type="button"
                          className="users-secondary-btn"
                          onClick={() => openQuotaModal(selectedUserSummary)}
                        >
                          Set Quota
                        </button>
                        <button
                          type="button"
                          className="users-secondary-btn users-danger-btn"
                          onClick={() => openDeleteModal(selectedUserSummary)}
                        >
                          Delete User
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="users-profile-grid">
                  <div className="users-stat-card">
                    <span>Quota</span>
                    <strong>{selectedUser.profile?.storage_quota_mb ?? 0} MB</strong>
                  </div>
                  <div className="users-stat-card">
                    <span>Used</span>
                    <strong>{formatBytes(selectedUser.profile?.storage_used_bytes ?? 0)}</strong>
                  </div>
                  <div className="users-stat-card">
                    <span>Created</span>
                    <strong>{formatDate(selectedUser.profile?.created_at)}</strong>
                  </div>
                  <div className="users-stat-card">
                    <span>Review Status</span>
                    <strong>
                      {selectedUser.profile?.ready_for_review || selectedUser.profile?.has_review_request
                        ? 'Ready'
                        : 'Not Requested'}
                    </strong>
                  </div>
                </div>

                <div className="users-repos-section">
                  <div className="users-section-heading">
                    <h3>Repositories</h3>
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
                              <h4>{repo.name || 'Untitled Repository'}</h4>
                              <p>{repo.description || 'No description provided.'}</p>
                            </div>
                            <div className="users-repo-actions">
                              <button
                                type="button"
                                className="users-secondary-btn"
                                onClick={() => handleCopyCloneUrl(repo)}
                              >
                                {copiedRepoId === repo.id ? 'Copied' : 'Copy Clone URL'}
                              </button>
                              <button
                                type="button"
                                className="users-secondary-btn"
                                onClick={() => handleInspectRepo(repo.id)}
                              >
                                Inspect Repository
                              </button>
                            </div>
                          </div>

                          <div className="users-repo-meta">
                            <span>Path: {normalizeGitPath(repo.repo_path || repo.path || '') || 'Unknown'}</span>
                            <span>Updated: {formatDate(repo.updated_at)}</span>
                            <span>Files: {files.length}</span>
                          </div>

                          <RepoFilesTable files={files} />

                          {inspect.loading ? <div className="users-empty-subtle">Inspecting repository...</div> : null}
                          {inspect.error ? <div className="users-error-subtle">{inspect.error}</div> : null}
                          {inspect.data ? (
                            <div className="users-inspect-box">
                              <div>Git Path: {normalizeGitPath(inspect.data.repo_path || '') || 'Unknown'}</div>
                              <div>Bare Repo: {inspect.data.bare_exists ? 'Yes' : 'No'}</div>
                              <div>Annex Branch: {inspect.data.git_annex_exists ? 'Yes' : 'No'}</div>
                              <div>HEAD Ref: {inspect.data.head_ref || 'Unknown'}</div>
                            </div>
                          ) : null}
                        </article>
                      );
                    })
                  ) : (
                    <div className="users-empty-subtle">This user does not have any repositories yet.</div>
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
                <h2>Create Student</h2>
                <button type="button" className="users-close-btn" onClick={closeCreateModal}>
                  Close
                </button>
              </div>

              <form className="users-form" onSubmit={handleCreateUser}>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={createState.email}
                    onChange={(event) => setCreateState((current) => ({ ...current, email: event.target.value }))}
                    required
                  />
                </label>

                <label>
                  <span>Password</span>
                  <input
                    type="password"
                    value={createState.password}
                    onChange={(event) => setCreateState((current) => ({ ...current, password: event.target.value }))}
                    required
                  />
                </label>

                <label>
                  <span>Display Name</span>
                  <input
                    type="text"
                    value={createState.displayName}
                    onChange={(event) => setCreateState((current) => ({ ...current, displayName: event.target.value }))}
                  />
                </label>

                <label>
                  <span>Role</span>
                  <select
                    value={createState.role}
                    onChange={(event) => setCreateState((current) => ({ ...current, role: event.target.value }))}
                  >
                    <option value="student">Student</option>
                    <option value="instructor">Instructor</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>

                <label>
                  <span>Quota (MB)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={createState.quotaMb}
                    onChange={(event) => setCreateState((current) => ({ ...current, quotaMb: event.target.value }))}
                  />
                </label>

                {createState.error ? <div className="users-error">{createState.error}</div> : null}

                <div className="users-modal-actions">
                  <button type="button" className="users-secondary-btn" onClick={closeCreateModal}>
                    Cancel
                  </button>
                  <button type="submit" className="users-primary-btn" disabled={createState.submitting}>
                    {createState.submitting ? 'Creating...' : 'Create User'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {editState.open ? (
          <div className="users-modal-backdrop" role="presentation" onClick={closeEditModal}>
            <div className="users-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <div className="users-modal-header">
                <h2>Edit User</h2>
                <button type="button" className="users-close-btn" onClick={closeEditModal}>
                  Close
                </button>
              </div>

              <form className="users-form" onSubmit={handleEditUser}>
                <label>
                  <span>Email</span>
                  <input type="text" value={editState.email} readOnly />
                </label>

                <label>
                  <span>Display Name</span>
                  <input
                    type="text"
                    value={editState.displayName}
                    onChange={(event) => setEditState((current) => ({ ...current, displayName: event.target.value }))}
                  />
                </label>

                <label>
                  <span>Role</span>
                  <select
                    value={editState.role}
                    onChange={(event) => setEditState((current) => ({ ...current, role: event.target.value }))}
                  >
                    <option value="student">Student</option>
                    <option value="instructor">Instructor</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>

                <label>
                  <span>Quota (MB)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editState.quotaMb}
                    onChange={(event) => setEditState((current) => ({ ...current, quotaMb: event.target.value }))}
                  />
                </label>

                <label>
                  <span>Used Bytes</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editState.usedBytes}
                    onChange={(event) => setEditState((current) => ({ ...current, usedBytes: event.target.value }))}
                  />
                </label>

                <label>
                  <span>Last Active</span>
                  <input
                    type="datetime-local"
                    value={editState.lastActiveAt}
                    onChange={(event) => setEditState((current) => ({ ...current, lastActiveAt: event.target.value }))}
                  />
                </label>

                {editState.error ? <div className="users-error">{editState.error}</div> : null}

                <div className="users-modal-actions">
                  <button type="button" className="users-secondary-btn" onClick={closeEditModal}>
                    Cancel
                  </button>
                  <button type="submit" className="users-primary-btn" disabled={editState.submitting}>
                    {editState.submitting ? 'Saving...' : 'Save User'}
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
                <h2>Update Quota</h2>
                <button type="button" className="users-close-btn" onClick={closeQuotaModal}>
                  Close
                </button>
              </div>

              <form className="users-form" onSubmit={handleSaveQuota}>
                <label>
                  <span>Student</span>
                  <input type="text" value={quotaState.email} readOnly />
                </label>

                <label>
                  <span>Quota (MB)</span>
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
                    Reset
                  </button>
                  <button type="submit" className="users-primary-btn" disabled={quotaState.submitting}>
                    {quotaState.submitting ? 'Saving...' : 'Save Quota'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {deleteState.open ? (
          <div className="users-modal-backdrop" role="presentation" onClick={closeDeleteModal}>
            <div className="users-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <div className="users-modal-header">
                <h2>Delete User</h2>
                <button type="button" className="users-close-btn" onClick={closeDeleteModal}>
                  Close
                </button>
              </div>
              <div className="users-form">
                <p>Are you sure you want to delete {deleteState.label}?</p>
                {deleteState.error ? <div className="users-error">{deleteState.error}</div> : null}
                <div className="users-modal-actions">
                  <button type="button" className="users-secondary-btn" onClick={closeDeleteModal}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="users-primary-btn users-danger-btn"
                    disabled={deleteState.deleting}
                    onClick={handleDeleteUser}
                  >
                    {deleteState.deleting ? 'Deleting...' : 'Delete User'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
  );
}



