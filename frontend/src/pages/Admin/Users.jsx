import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, FolderGit2, Search, Users } from 'lucide-react';
import { adminService } from '../../services/adminService';

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

export default function AdminUsers() {
    const [users, setUsers] = useState([]);
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [selectedRepoId, setSelectedRepoId] = useState(null);
    const [repos, setRepos] = useState([]);
    const [files, setFiles] = useState([]);
    const [query, setQuery] = useState('');
    const [environmentKey, setEnvironmentKey] = useState('');
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [loadingRepos, setLoadingRepos] = useState(false);
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        // load the environment-scoped user list first so the rest of the drill-down can follow it.
        const loadUsers = async () => {
            setLoadingUsers(true);
            setError('');
            try {
                const data = await adminService.getUsers();
                setUsers(data.users || []);
                setEnvironmentKey(data.environmentKey || '');
                if (data.users?.length) {
                    setSelectedUserId((current) => current || data.users[0].id);
                }
            } catch (err) {
                setError(err.message || 'Failed to load users');
            } finally {
                setLoadingUsers(false);
            }
        };

        loadUsers();
    }, []);

    useEffect(() => {
        // when the selected user changes, load only that user's repos for this environment.
        const loadRepos = async () => {
            if (!selectedUserId) {
                setRepos([]);
                setFiles([]);
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
                setSelectedRepoId(null);
            } finally {
                setLoadingRepos(false);
            }
        };

        loadRepos();
    }, [selectedUserId]);

    useEffect(() => {
        // file inspection stays one repo at a time to keep the screen responsive.
        const loadFiles = async () => {
            if (!selectedRepoId) {
                setFiles([]);
                return;
            }

            setLoadingFiles(true);
            try {
                const data = await adminService.getRepoFiles(selectedRepoId);
                setFiles(data.files || []);
            } catch (err) {
                setError(err.message || 'Failed to load repository files');
                setFiles([]);
            } finally {
                setLoadingFiles(false);
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

    if (loadingUsers) return <div className="p-10 text-center">Loading users...</div>;
    if (error && !users.length) return <div className="p-10 text-center text-red-500">{error}</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Users</h1>
                    <p className="text-sm text-[--text-secondary] mt-1">
                        Browse students, their repos, and current cluster files.
                    </p>
                </div>
                <div className="px-3 py-2 rounded-lg bg-[--bg-secondary] border border-[--border-color] text-sm text-[--text-secondary]">
                    Environment: <span className="font-mono text-[--text-primary]">{environmentKey || 'unknown'}</span>
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

                                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <StatCard label="Repos" value={String(selectedUser.repoCount)} />
                                    <StatCard label="Used" value={`${selectedUser.used.toFixed(2)} GB`} />
                                    <StatCard label="Quota" value={`${selectedUser.quota.toFixed(2)} GB`} />
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
