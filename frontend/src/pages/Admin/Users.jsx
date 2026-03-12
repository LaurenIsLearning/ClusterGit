import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Copy, Download, FolderGit2, GitBranch, Plus, RotateCcw, Search, Users } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { createPortal } from 'react-dom';

function formatRelativeTime(iso) {
    if (!iso) return 'never';
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) return 'unknown';
    const seconds = Math.floor((Date.now() - ms) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
}

function bytesToGiB(bytes) {
    return ((Number(bytes) || 0) / (1024 ** 3)).toFixed(2);
}

export default function AdminUsers() {
    const [users, setUsers] = useState([]);
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [selectedRepoId, setSelectedRepoId] = useState(null);
    const [repos, setRepos] = useState([]);
    const [files, setFiles] = useState([]);
    const [inspection, setInspection] = useState({ repo: null, branches: [], commits: [], files: [] });
    const [query, setQuery] = useState('');
    const [environmentKey, setEnvironmentKey] = useState('');
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [loadingRepos, setLoadingRepos] = useState(false);
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [loadingInspection, setLoadingInspection] = useState(false);
    const [error, setError] = useState('');
    const [inspectWarning, setInspectWarning] = useState('');
    const [copiedCloneUrl, setCopiedCloneUrl] = useState('');
    const [quotaModalUser, setQuotaModalUser] = useState(null);
    const [studentModalOpen, setStudentModalOpen] = useState(false);
    const { addToast } = useToast();

    const loadUsers = async (preserveSelection = true) => {
        setLoadingUsers(true);
        setError('');
        try {
            const data = await adminService.getUsers();
            setUsers(data.users || []);
            setEnvironmentKey(data.environmentKey || '');
            if (data.users?.length) {
                setSelectedUserId((current) => {
                    if (preserveSelection && current && data.users.some((user) => user.id === current)) {
                        return current;
                    }
                    return data.users[0].id;
                });
            } else {
                setSelectedUserId(null);
            }
        } catch (err) {
            setError(err.message || 'Failed to load users');
        } finally {
            setLoadingUsers(false);
        }
    };

    useEffect(() => {
        loadUsers();
    }, []);

    useEffect(() => {
        const loadRepos = async () => {
            if (!selectedUserId) {
                setRepos([]);
                setFiles([]);
                setInspection({ repo: null, branches: [], commits: [], files: [] });
                setSelectedRepoId(null);
                return;
            }

            setLoadingRepos(true);
            try {
                const data = await adminService.getUserRepos(selectedUserId);
                const nextRepos = data.repos || [];
                setRepos(nextRepos);
                setSelectedRepoId((current) => {
                    if (current && nextRepos.some((repo) => repo.id === current)) {
                        return current;
                    }
                    return nextRepos[0]?.id || null;
                });
            } catch (err) {
                setError(err.message || 'Failed to load repositories');
                setRepos([]);
                setFiles([]);
                setInspection({ repo: null, branches: [], commits: [], files: [] });
                setSelectedRepoId(null);
            } finally {
                setLoadingRepos(false);
            }
        };

        loadRepos();
    }, [selectedUserId]);

    useEffect(() => {
        const loadFiles = async () => {
            if (!selectedRepoId) {
                setFiles([]);
                setInspection({ repo: null, branches: [], commits: [], files: [] });
                setInspectWarning('');
                return;
            }

            setLoadingFiles(true);
            setLoadingInspection(true);
            setInspectWarning('');
            try {
                const [fileData, inspectData] = await Promise.all([
                    adminService.getRepoFiles(selectedRepoId),
                    adminService.inspectRepo(selectedRepoId)
                ]);
                setFiles(fileData.files || []);
                setInspection({
                    repo: inspectData.repo || null,
                    branches: inspectData.branches || [],
                    commits: inspectData.commits || [],
                    files: inspectData.files || [],
                });
                setInspectWarning(inspectData.unavailableReason || '');
            } catch (err) {
                setError(err.message || 'Failed to load repository files');
                setFiles([]);
                setInspection({ repo: null, branches: [], commits: [], files: [] });
                setInspectWarning('');
            } finally {
                setLoadingFiles(false);
                setLoadingInspection(false);
            }
        };

        loadFiles();
    }, [selectedRepoId]);

    const filteredUsers = useMemo(() => {
        const value = query.trim().toLowerCase();
        if (!value) return users;
        return users.filter((user) =>
            user.name.toLowerCase().includes(value) || user.email.toLowerCase().includes(value)
        );
    }, [users, query]);

    const selectedUser = users.find((user) => user.id === selectedUserId) || null;
    const selectedRepo = repos.find((repo) => repo.id === selectedRepoId) || null;
    const cloneUrl = inspection.repo?.gitUrl || selectedRepo?.gitUrl || '';

    const handleDownload = async (filePath) => {
        if (!selectedRepoId || !filePath) return;

        try {
            await adminService.downloadRepoFile(selectedRepoId, filePath);
            addToast(`Download started for ${filePath}`, 'success');
        } catch (err) {
            setError(err.message || 'Failed to download file');
        }
    };

    const handleCopyCloneUrl = async (gitUrl) => {
        if (!gitUrl) return;
        await navigator.clipboard.writeText(gitUrl);
        setCopiedCloneUrl(gitUrl);
        addToast('Clone URL copied to clipboard', 'success');
        setTimeout(() => setCopiedCloneUrl(''), 2000);
    };

    const handleCreateStudent = async ({ email, password, displayName, quotaGb }) => {
        await adminService.createStudent({
            email,
            password,
            displayName,
            storageQuotaBytes: Math.round(Number(quotaGb) * (1024 ** 3))
        });
        addToast(`Created student ${email}`, 'success');
        await loadUsers(false);
    };

    const handleUpdateQuota = async ({ userId, quotaGb }) => {
        await adminService.updateUserQuota(userId, Math.round(Number(quotaGb) * (1024 ** 3)));
        addToast('Quota updated', 'success');
        await loadUsers();
    };

    const handleResetQuota = async (userId) => {
        await adminService.resetUserQuota(userId);
        addToast('Quota reset to default', 'success');
        await loadUsers();
    };

    if (loadingUsers) return <div className="p-10 text-center">Loading users...</div>;
    if (error && !users.length) return <div className="p-10 text-center text-red-500">{error}</div>;

    return (
        <div className="space-y-6">
            <CreateStudentModal
                isOpen={studentModalOpen}
                onClose={() => setStudentModalOpen(false)}
                onSubmit={handleCreateStudent}
            />
            <QuotaModal
                user={quotaModalUser}
                isOpen={Boolean(quotaModalUser)}
                onClose={() => setQuotaModalUser(null)}
                onSubmit={handleUpdateQuota}
            />

            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Users</h1>
                    <p className="text-sm text-[--text-secondary] mt-1">
                        Browse students, their repos, and current cluster files.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="px-3 py-2 rounded-lg bg-[--bg-secondary] border border-[--border-color] text-sm text-[--text-secondary]">
                        Environment: <span className="font-mono text-[--text-primary]">{environmentKey || 'unknown'}</span>
                    </div>
                    <button className="btn btn-primary gap-2" onClick={() => setStudentModalOpen(true)}>
                        <Plus className="w-4 h-4" />
                        Add Student
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[360px,1fr] gap-6">
                <section className="card overflow-hidden">
                    <div className="p-4 border-b border-[--border-color] bg-[--bg-secondary]">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[--text-muted]" />
                            <input
                                type="text"
                                placeholder="Search students..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 rounded-md bg-[--bg-primary] border border-[--border-color] text-sm focus:outline-none focus:border-[--accent-primary]"
                            />
                        </div>
                        <div className="mt-3 text-sm text-[--text-secondary] flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            <span>{filteredUsers.length} users in this environment</span>
                        </div>
                    </div>

                    <div className="max-h-[70vh] overflow-y-auto">
                        {filteredUsers.map((user) => (
                            <button
                                key={user.id}
                                onClick={() => setSelectedUserId(user.id)}
                                className={`w-full text-left p-4 border-b border-[--border-color] transition-colors ${
                                    selectedUserId === user.id
                                        ? 'bg-[--bg-tertiary]'
                                        : 'hover:bg-[--bg-tertiary]/40'
                                } ${user.hasReviewRequest ? 'border-l-4 border-l-amber-400' : ''}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold truncate">{user.name}</span>
                                            {user.hasReviewRequest && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-300 px-2 py-0.5 text-xs">
                                                    <AlertCircle className="w-3 h-3" />
                                                    Review requested
                                                </span>
                                            )}
                                            {user.isAdminCreated && (
                                                <span className="rounded-full bg-sky-500/15 text-sky-300 px-2 py-0.5 text-xs">
                                                    admin created
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-[--text-secondary] truncate">{user.email}</p>
                                    </div>
                                    <div className="text-right text-xs text-[--text-muted]">
                                        <div>{user.used.toFixed(2)} / {user.quota.toFixed(2)} GB</div>
                                        <div>{user.repoCount} repos</div>
                                    </div>
                                </div>
                                <div className="mt-3 h-1.5 w-full bg-[--bg-primary] rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${
                                            user.quota > 0 && (user.used / user.quota) > 0.9
                                                ? 'bg-[--status-error]'
                                                : 'bg-[--accent-primary]'
                                        }`}
                                        style={{ width: `${user.quota > 0 ? Math.min(100, (user.used / user.quota) * 100) : 0}%` }}
                                    />
                                </div>
                                <div className="mt-3 flex items-center justify-between text-xs text-[--text-muted]">
                                    <span>Last active {user.lastActive}</span>
                                    {user.reviewRequestedAt && (
                                        <span>Review {formatRelativeTime(user.reviewRequestedAt)}</span>
                                    )}
                                </div>
                            </button>
                        ))}

                        {filteredUsers.length === 0 && (
                            <div className="p-8 text-center text-[--text-muted]">No users found.</div>
                        )}
                    </div>
                </section>

                <section className="space-y-6">
                    <div className="card p-6">
                        {selectedUser ? (
                            <>
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h2 className="text-2xl font-bold">{selectedUser.name}</h2>
                                        <p className="text-sm text-[--text-secondary] mt-1">{selectedUser.email}</p>
                                    </div>
                                    {selectedUser.hasReviewRequest && (
                                        <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 max-w-sm">
                                            <div className="font-semibold">Ready for review</div>
                                            <div className="mt-1 text-amber-100/80">
                                                {selectedUser.reviewDetail || 'This student requested review on a repository.'}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <StatCard label="Repos" value={String(selectedUser.repoCount)} />
                                    <StatCard label="Used" value={`${selectedUser.used.toFixed(2)} GB`} />
                                    <StatCard label="Quota" value={`${selectedUser.quota.toFixed(2)} GB`} />
                                </div>

                                <div className="mt-6 flex flex-wrap gap-3">
                                    <button className="btn btn-secondary" onClick={() => setQuotaModalUser(selectedUser)}>
                                        Set Quota
                                    </button>
                                    <button
                                        className="btn btn-ghost text-[--status-error] hover:bg-red-500/10"
                                        onClick={() => handleResetQuota(selectedUser.id)}
                                    >
                                        <RotateCcw className="w-4 h-4 mr-2" />
                                        Reset Quota
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="text-[--text-muted]">Select a user to inspect their repositories.</div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-6">
                        <div className="card overflow-hidden">
                            <div className="p-4 border-b border-[--border-color] bg-[--bg-secondary]">
                                <h3 className="font-semibold">Repositories</h3>
                                <p className="text-sm text-[--text-secondary] mt-1">
                                    {loadingRepos ? 'Loading repositories...' : `${repos.length} repos in ${environmentKey || 'this environment'}`}
                                </p>
                            </div>
                            <div className="max-h-[55vh] overflow-y-auto">
                                {repos.map((repo) => (
                                    <button
                                        key={repo.id}
                                        onClick={() => setSelectedRepoId(repo.id)}
                                        className={`w-full text-left p-4 border-b border-[--border-color] transition-colors ${
                                            selectedRepoId === repo.id
                                                ? 'bg-[--bg-tertiary]'
                                                : 'hover:bg-[--bg-tertiary]/40'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <FolderGit2 className="w-4 h-4 text-[--accent-primary]" />
                                                    <span className="font-medium truncate">{repo.name}</span>
                                                </div>
                                                <div className="mt-2 text-xs text-[--text-muted]">
                                                    {repo.sizeLabel} · {formatRelativeTime(repo.lastActivityAt || repo.createdAt)}
                                                </div>
                                            </div>
                                            {repo.hasReviewRequest && (
                                                <span className="text-[10px] rounded-full bg-amber-500/15 text-amber-300 px-2 py-0.5">
                                                    Review
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                ))}
                                {!loadingRepos && repos.length === 0 && (
                                    <div className="p-6 text-sm text-[--text-muted]">No repositories for this user in the current environment.</div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="card overflow-hidden">
                                <div className="p-4 border-b border-[--border-color] bg-[--bg-secondary]">
                                    <h3 className="font-semibold">
                                        {selectedRepo ? `Files in ${selectedRepo.name}` : 'Files'}
                                    </h3>
                                    <p className="text-sm text-[--text-secondary] mt-1">
                                        {loadingFiles ? 'Loading files...' : `${files.length} tracked files`}
                                    </p>
                                </div>

                                <div className="max-h-[55vh] overflow-y-auto">
                                    {files.length > 0 ? (
                                        <table className="w-full text-left">
                                            <thead className="text-xs uppercase text-[--text-muted] bg-[--bg-tertiary]">
                                                <tr>
                                                    <th className="px-4 py-3">Name</th>
                                                    <th className="px-4 py-3">Size</th>
                                                    <th className="px-4 py-3">Status</th>
                                                    <th className="px-4 py-3">Uploaded</th>
                                                    <th className="px-4 py-3 text-right">Access</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[--border-color]">
                                                {files.map((file) => (
                                                    <tr key={file.id}>
                                                        <td className="px-4 py-3">
                                                            <div className="font-medium">{file.name}</div>
                                                            <div className="text-xs text-[--text-muted]">{file.path}</div>
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-[--text-secondary]">{file.sizeLabel}</td>
                                                        <td className="px-4 py-3 text-sm text-[--text-secondary]">{file.status}</td>
                                                        <td className="px-4 py-3 text-sm text-[--text-secondary]">{formatRelativeTime(file.uploadedAt)}</td>
                                                        <td className="px-4 py-3 text-right">
                                                            <button
                                                                onClick={() => handleDownload(file.path)}
                                                                className="inline-flex items-center gap-2 text-sm text-[--accent-primary] hover:underline"
                                                            >
                                                                <Download className="w-4 h-4" />
                                                                Download
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div className="p-6 text-sm text-[--text-muted]">
                                            {selectedRepo
                                                ? 'No files tracked for this repository in the current environment.'
                                                : 'Select a repository to inspect its files.'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="card p-6">
                                <div className="flex items-center justify-between gap-4 mb-4">
                                    <div className="flex items-center gap-2">
                                        <GitBranch className="w-5 h-5 text-[--accent-primary]" />
                                        <h3 className="font-semibold">Live Repository Inspect</h3>
                                    </div>
                                    {cloneUrl && (
                                        <button
                                            onClick={() => handleCopyCloneUrl(cloneUrl)}
                                            className="btn btn-secondary gap-2"
                                        >
                                            {copiedCloneUrl === cloneUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                            Copy Clone URL
                                        </button>
                                    )}
                                </div>
                                {selectedRepo ? (
                                    <div className="space-y-5">
                                        {cloneUrl && (
                                            <div className="rounded-lg border border-[--border-color] bg-[--bg-secondary] px-4 py-3">
                                                <div className="text-xs text-[--text-muted] uppercase tracking-wide">clone url</div>
                                                <div className="mt-1 font-mono text-sm break-all">{cloneUrl}</div>
                                            </div>
                                        )}

                                        {inspectWarning && (
                                            <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                                                {inspectWarning}
                                            </div>
                                        )}

                                        <div>
                                            <div className="text-sm font-medium mb-2">Branches</div>
                                            <div className="flex flex-wrap gap-2">
                                                {inspection.branches.map((branch) => (
                                                    <span key={branch} className="px-2.5 py-1 rounded-full bg-[--bg-tertiary] text-xs font-mono">
                                                        {branch}
                                                    </span>
                                                ))}
                                                {!loadingInspection && inspection.branches.length === 0 && (
                                                    <span className="text-sm text-[--text-muted]">No branch data available.</span>
                                                )}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="text-sm font-medium mb-2">Recent commits</div>
                                            <div className="space-y-2">
                                                {inspection.commits.slice(0, 5).map((commit) => (
                                                    <div key={commit.hash} className="rounded-lg border border-[--border-color] bg-[--bg-secondary] p-3">
                                                        <div className="font-mono text-xs text-[--text-muted]">{commit.hash?.slice(0, 12)}</div>
                                                        <div className="mt-1 text-sm">{commit.message}</div>
                                                        <div className="mt-1 text-xs text-[--text-secondary]">
                                                            {commit.author} · {formatRelativeTime(commit.committed_at)}
                                                        </div>
                                                    </div>
                                                ))}
                                                {!loadingInspection && inspection.commits.length === 0 && (
                                                    <div className="text-sm text-[--text-muted]">No commit data available.</div>
                                                )}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="text-sm font-medium mb-2">Git tree</div>
                                            <div className="max-h-56 overflow-y-auto space-y-2">
                                                {inspection.files.slice(0, 20).map((file) => (
                                                    <div key={file.path} className="flex items-center justify-between gap-4 rounded-lg border border-[--border-color] bg-[--bg-secondary] px-3 py-2">
                                                        <div className="min-w-0">
                                                            <div className="font-mono text-sm truncate">{file.path}</div>
                                                            <div className="text-xs text-[--text-muted]">{file.type} · {file.objectId.slice(0, 10)}</div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleDownload(file.path)}
                                                            className="inline-flex items-center gap-2 text-sm text-[--accent-primary] hover:underline flex-shrink-0"
                                                        >
                                                            <Download className="w-4 h-4" />
                                                            Try download
                                                        </button>
                                                    </div>
                                                ))}
                                                {!loadingInspection && inspection.files.length === 0 && (
                                                    <div className="text-sm text-[--text-muted]">No git tree data available.</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-sm text-[--text-muted]">Select a repository to inspect live git data.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            {error && users.length > 0 && (
                <div className="text-sm text-red-400">{error}</div>
            )}
        </div>
    );
}

function StatCard({ label, value }) {
    return (
        <div className="rounded-xl border border-[--border-color] bg-[--bg-secondary] px-4 py-3">
            <div className="text-sm text-[--text-secondary]">{label}</div>
            <div className="text-xl font-semibold mt-1">{value}</div>
        </div>
    );
}

function CreateStudentModal({ isOpen, onClose, onSubmit }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [quotaGb, setQuotaGb] = useState('20');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setSaving(true);
        try {
            await onSubmit({ email, password, displayName, quotaGb });
            setEmail('');
            setPassword('');
            setDisplayName('');
            setQuotaGb('20');
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to create student');
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center overlay-scrim p-4" onClick={onClose}>
            <div className="modal-panel w-full max-w-lg rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4">Add Student</h2>
                <form className="space-y-4" onSubmit={handleSubmit}>
                    <Field label="Email">
                        <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-[--border-color] bg-[--bg-tertiary]" />
                    </Field>
                    <Field label="Password">
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-[--border-color] bg-[--bg-tertiary]" />
                    </Field>
                    <Field label="Display Name">
                        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-[--border-color] bg-[--bg-tertiary]" />
                    </Field>
                    <Field label="Quota (GB)">
                        <input type="number" min="0" step="0.5" value={quotaGb} onChange={(e) => setQuotaGb(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-[--border-color] bg-[--bg-tertiary]" />
                    </Field>
                    {error && <div className="text-sm text-red-400">{error}</div>}
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating...' : 'Create Student'}</button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}

function QuotaModal({ user, isOpen, onClose, onSubmit }) {
    const [quotaGb, setQuotaGb] = useState('20');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (user) {
            setQuotaGb(bytesToGiB(user.quotaBytes || 0));
            setError('');
        }
    }, [user]);

    if (!isOpen || !user) return null;

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setSaving(true);
        try {
            await onSubmit({ userId: user.id, quotaGb });
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to update quota');
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center overlay-scrim p-4" onClick={onClose}>
            <div className="modal-panel w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-2">Set Quota</h2>
                <p className="text-sm text-[--text-secondary] mb-4">{user.name}</p>
                <form className="space-y-4" onSubmit={handleSubmit}>
                    <Field label="Quota (GB)">
                        <input type="number" min="0" step="0.5" value={quotaGb} onChange={(e) => setQuotaGb(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-[--border-color] bg-[--bg-tertiary]" />
                    </Field>
                    {error && <div className="text-sm text-red-400">{error}</div>}
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Quota'}</button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}

function Field({ label, children }) {
    return (
        <label className="block">
            <div className="text-sm font-medium mb-2">{label}</div>
            {children}
        </label>
    );
}
