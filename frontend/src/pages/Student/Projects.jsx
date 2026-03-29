import { useState, useEffect } from 'react';
import { projectService } from '../../services/projectService';
import { FolderGit2, FileCode, Film, Database, HardDrive, Plus, MoreVertical, Github, Copy, Check, CircleHelp, TerminalSquare, ArrowUpDown, Download, BookOpen, ExternalLink } from 'lucide-react';
import UploadModal from '../../components/UploadModal';
import NewProjectModal from '../../components/NewProjectModal';
import ConfirmationModal from '../../components/ConfirmationModal';
import { useToast } from '../../context/ToastContext';

const ANNEX_COMMANDS = [
    {
        name: 'git annex add',
        icon: TerminalSquare,
        summary: 'Stages large files for annex tracking before you commit.',
        detail: 'Use this like git add for big files. After this, commit with git commit as usual.',
    },
    {
        name: 'git annex push',
        icon: ArrowUpDown,
        summary: 'Pushes annexed file content to your repository.',
        detail: 'Use this instead of a regular git push when large file content needs to move to the cluster.',
    },
    {
        name: 'git annex pull',
        icon: Download,
        summary: 'Pulls metadata and downloads annexed content for your repo.',
        detail: 'This is especially useful right after cloning, since clone usually gives you pointers before content.',
    },
    {
        name: 'git annex get <file>',
        icon: Download,
        summary: 'Downloads one specific annexed file onto your machine.',
        detail: 'Use this when you only need one file instead of syncing the whole repository content.',
    },
    {
        name: 'git annex sync --content',
        icon: ArrowUpDown,
        summary: 'Syncs metadata and file content in both directions.',
        detail: 'Plain git annex sync mainly handles metadata. Adding --content pulls and pushes annexed file data too.',
    },
];

export default function StudentProjects() {
    const [projects, setProjects] = useState([]);
    const [selectedProject, setSelectedProject] = useState(null);
    const [files, setFiles] = useState([]);
    const [activePanel, setActivePanel] = useState('files');
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState(null);
    const [openProjectMenu, setOpenProjectMenu] = useState(null);
    const [openFileMenu, setOpenFileMenu] = useState(null);
    const [confirmState, setConfirmState] = useState(null);
    const { addToast } = useToast();

    // Load projects on mount
    useEffect(() => {
        loadProjects();
    }, []);

    const formatSize = (sizeBytes) => {
        const bytes = Number(sizeBytes) || 0;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const loadProjects = async () => {
        try {
            setLoading(true);
            const data = await projectService.getMyProjects();
            setProjects(data);
            if (data.length > 0 && !selectedProject) {
                setSelectedProject(data[0].id);
            }
        } catch (error) {
            console.error('Failed to load projects:', error);
            addToast(error.message || 'Failed to load projects', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Load files when project changes
    useEffect(() => {
        const loadFiles = async () => {
            if (!selectedProject) {
                setFiles([]);
                return;
            }

            try {
                const data = await projectService.getProjectFiles(selectedProject);
                const normalized = (data || []).map((file) => ({
                    id: file.id,
                    name: file.name,
                    path: file.path || file.name,
                    size: formatSize(file.size_bytes),
                    type: file.type || 'unknown',
                    status: file.status || 'synced',
                }));
                setFiles(normalized);
            } catch (error) {
                console.error('Failed to load files:', error);
                addToast(error.message || 'Failed to load project files', 'error');
                setFiles([]);
            }
        };

        loadFiles();
    }, [selectedProject, addToast]);

    const handleUploadComplete = async () => {
        if (!selectedProject) return;

        try {
            const data = await projectService.getProjectFiles(selectedProject);
            const normalized = (data || []).map((item) => ({
                id: item.id,
                name: item.name,
                path: item.path || item.name,
                size: formatSize(item.size_bytes),
                type: item.type || 'unknown',
                status: item.status || 'synced',
            }));
            setFiles(normalized);
        } catch (error) {
            console.error('Failed to refresh files after upload:', error);
            addToast(error.message || 'Upload succeeded, but file list refresh failed', 'error');
        }
    };

    const handleNewProject = () => {
        setIsNewProjectOpen(true);
    };

    const handleCreateProject = async (name, description) => {
        try {
            await projectService.createProject(name, description);
            addToast('Project created successfully!', 'success');
            await loadProjects();
        } catch (error) {
            throw error; // Let modal handle the error display
        }
    };

    const handleCopyCloneLink = (e, link, id) => {
        if (e) e.stopPropagation();
        navigator.clipboard.writeText(link);
        setCopiedId(id);
        addToast('Clone link copied to clipboard!', 'success');
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleDeleteFile = async (file) => {
        if (!currentProject) return;

        try {
            await projectService.deleteFile(currentProject.id, file.id);
            addToast(`Deleted ${file.name}`, 'success');
            await handleUploadComplete();
            await loadProjects();
        } catch (error) {
            addToast(error.message || 'Failed to delete file', 'error');
        }
    };

    const handleDeleteProject = async (project) => {
        if (!project) return;

        try {
            await projectService.deleteProject(project.id);
            addToast(`Deleted repository ${project.name}`, 'success');
            setSelectedProject(null);
            setFiles([]);
            await loadProjects();
        } catch (error) {
            addToast(error.message || 'Failed to delete repository', 'error');
        }
    };

    const handleRequestReview = async (project) => {
        if (!project) return;

        try {
            await projectService.requestReview(project.id);
            addToast(`Review requested for ${project.name}`, 'success');
            setOpenProjectMenu(null);
        } catch (error) {
            addToast(error.message || 'Failed to request review', 'error');
        }
    };

    if (loading) return <div className="p-10 text-center">Loading projects...</div>;

    const currentProject = projects.find(p => p.id === selectedProject);

    return (
        <div className="flex h-[calc(100vh-8rem)] gap-6">
            <UploadModal
                project={currentProject?.name}
                projectId={currentProject?.id}
                isOpen={isUploadOpen}
                onClose={() => setIsUploadOpen(false)}
                onComplete={handleUploadComplete}
            />

            <NewProjectModal
                isOpen={isNewProjectOpen}
                onClose={() => setIsNewProjectOpen(false)}
                onCreateProject={handleCreateProject}
            />

            <ConfirmationModal
                isOpen={Boolean(confirmState)}
                onClose={() => setConfirmState(null)}
                onConfirm={() => confirmState?.onConfirm()}
                title={confirmState?.title || 'Confirm action'}
                message={confirmState?.message || 'Are you sure?'}
                confirmText={confirmState?.confirmText || 'Confirm'}
                confirmStyle={confirmState?.confirmStyle || 'danger'}
            />

            {/* Project List Sidebar */}
            <div className="w-1/3 flex flex-col gap-4">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-xl font-bold">Projects</h2>
                    <button onClick={handleNewProject} className="btn btn-secondary text-sm p-2"><Plus className="w-4 h-4" /></button>
                </div>

                <div className="space-y-3 overflow-y-auto pr-2">
                    {projects.map(project => (
                        <div
                            key={project.id}
                            onClick={() => {
                                setSelectedProject(project.id);
                                setActivePanel('files');
                                setOpenProjectMenu(null);
                                setOpenFileMenu(null);
                            }}
                            className={`relative p-4 rounded-lg border cursor-pointer transition-all ${selectedProject === project.id
                                ? 'bg-[--bg-secondary] border-[--accent-primary]'
                                : 'bg-[--bg-secondary]/50 border-transparent hover:border-[--border-color]'
                                }`}
                        >
                            <div className="flex justify-between items-start mb-2 gap-3">
                                <h3 className="font-semibold">{project.name}</h3>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenProjectMenu(openProjectMenu === project.id ? null : project.id);
                                            setOpenFileMenu(null);
                                        }}
                                        className="p-1.5 rounded hover:bg-[--bg-tertiary]"
                                        title="Project actions"
                                    >
                                        <MoreVertical className="w-4 h-4 text-[--text-secondary]" />
                                    </button>
                                    <FolderGit2 className={`w-5 h-5 ${selectedProject === project.id ? 'text-[--accent-primary]' : 'text-[--text-muted]'}`} />
                                </div>
                            </div>
                            {openProjectMenu === project.id && (
                                <div className="menu-panel absolute right-4 top-12 z-20 w-44 rounded-xl p-1">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedProject(project.id);
                                            handleRequestReview(project);
                                        }}
                                        className="w-full text-left px-3 py-2 rounded hover:bg-[--bg-tertiary] text-sm"
                                    >
                                        Ready for review
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedProject(project.id);
                                            setOpenProjectMenu(null);
                                            setConfirmState({
                                                title: 'Delete Repository?',
                                                message: `Delete ${project.name} from the cluster and Supabase metadata? This cannot be undone.`,
                                                confirmText: 'Delete Repo',
                                                confirmStyle: 'danger',
                                                onConfirm: () => handleDeleteProject(project),
                                            });
                                        }}
                                        className="w-full text-left px-3 py-2 rounded hover:bg-[--bg-tertiary] text-sm text-red-500"
                                    >
                                        Delete repository
                                    </button>
                                </div>
                            )}
                            <div className="text-sm text-[--text-secondary] flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2 truncate">
                                    <Github className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{project.repo}</span>
                                </div>
                                <button
                                    onClick={(e) => handleCopyCloneLink(e, project.repo, project.id)}
                                    className="p-1 hover:bg-[--bg-tertiary] rounded transition-colors flex-shrink-0"
                                    title="Copy clone link"
                                >
                                    {copiedId === project.id ? (
                                        <Check className="w-3 h-3 text-emerald-500" />
                                    ) : (
                                        <Copy className="w-3 h-3 text-[--text-muted]" />
                                    )}
                                </button>
                            </div>
                            <div className="flex justify-between text-xs text-[--text-muted] mt-3">
                                <span>{project.size}</span>
                                <span>{project.updated}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* File Browser */}
            <div className="flex-1 flex flex-col bg-[--bg-secondary] rounded-xl border border-[--border-color] overflow-hidden">
                {currentProject || activePanel === 'help' ? (
                    <>
                        {/* Toolbar */}
                        <div className="p-6 border-b border-[--border-color] flex justify-between items-center bg-[--bg-secondary] gap-4">
                            <div>
                                {activePanel === 'files' && currentProject ? (
                                    <>
                                        <h2 className="text-xl font-bold flex items-center gap-2">
                                            {currentProject.name}
                                            <span className="text-xs px-2 py-1 rounded bg-[--bg-tertiary] text-[--text-muted] font-normal">Active</span>
                                        </h2>
                                        <p className="text-sm text-[--text-secondary] mt-1">{files.length} large files stored</p>
                                    </>
                                ) : (
                                    <>
                                        <h2 className="text-xl font-bold flex items-center gap-2">
                                            <CircleHelp className="w-5 h-5 text-emerald-600" />
                                            Annex Help
                                        </h2>
                                        <p className="text-sm text-[--text-secondary] mt-1">Command reference for working with large files in ClusterGit.</p>
                                    </>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="inline-flex rounded-xl bg-[--bg-tertiary] p-1 border border-[--border-color]">
                                    <button
                                        onClick={() => currentProject && setActivePanel('files')}
                                        disabled={!currentProject}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activePanel === 'files'
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-[--text-secondary] hover:text-slate-900'
                                            } ${!currentProject ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        Files
                                    </button>
                                    <button
                                        onClick={() => setActivePanel('help')}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activePanel === 'help'
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-[--text-secondary] hover:text-slate-900'
                                            }`}
                                    >
                                        Annex Help
                                    </button>
                                </div>

                                {activePanel === 'files' && currentProject ? (
                                    <>
                                        <button
                                            onClick={(e) => handleCopyCloneLink(e, currentProject.repo, 'header')}
                                            className="btn btn-secondary gap-2"
                                        >
                                            {copiedId === 'header' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                            Clone
                                        </button>
                                        <button
                                            onClick={() => setIsUploadOpen(true)}
                                            className="btn btn-primary gap-2"
                                        >
                                            <Plus className="w-5 h-5" />
                                            Upload File
                                        </button>
                                    </>
                                ) : null}
                            </div>
                        </div>

                        {activePanel === 'files' && currentProject ? (
                            <div className="flex-1 overflow-y-auto p-4">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="text-[--text-muted] text-sm border-b border-[--border-color]">
                                            <th className="pb-3 pl-4 font-medium">Name</th>
                                            <th className="pb-3 font-medium">Size</th>
                                            <th className="pb-3 font-medium">Type</th>
                                            <th className="pb-3 font-medium">Status</th>
                                            <th className="pb-3 pr-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[--border-color]">
                                        {files.map(file => (
                                            <tr key={file.id} className="group hover:bg-[--bg-tertiary]/30 transition-colors">
                                                <td className="py-4 pl-4 flex items-center gap-3">
                                                    <FileIcon type={file.type} />
                                                    <span className="font-medium">{file.name}</span>
                                                </td>
                                                <td className="py-4 text-[--text-secondary] font-mono text-sm">{file.size}</td>
                                                <td className="py-4 text-[--text-secondary] capitalize">{file.type}</td>
                                                <td className="py-4">
                                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-medium border border-emerald-500/20">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                        {file.status}
                                                    </span>
                                                </td>
                                                <td className="py-4 pr-4 text-right relative">
                                                    <button
                                                        onClick={() => setOpenFileMenu(openFileMenu === file.id ? null : file.id)}
                                                        className="p-2 hover:bg-[--bg-tertiary] rounded opacity-0 group-hover:opacity-100 transition-all"
                                                    >
                                                        <MoreVertical className="w-4 h-4 text-[--text-secondary]" />
                                                    </button>
                                                    {openFileMenu === file.id && (
                                                        <div className="menu-panel absolute right-4 top-12 z-20 w-40 rounded-xl p-1">
                                                            <button
                                                                onClick={() => {
                                                                    setOpenFileMenu(null);
                                                                    setConfirmState({
                                                                        title: 'Delete File?',
                                                                        message: `Delete ${file.name} from the repository and metadata?`,
                                                                        confirmText: 'Delete File',
                                                                        confirmStyle: 'danger',
                                                                        onConfirm: () => handleDeleteFile(file),
                                                                    });
                                                                }}
                                                                className="w-full text-left px-3 py-2 rounded hover:bg-[--bg-tertiary] text-sm text-red-500"
                                                            >
                                                                Delete file
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {files.length === 0 && (
                                            <tr>
                                                <td colSpan="5" className="py-12 text-center text-[--text-muted]">
                                                    No large files in this repository yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <AnnexHelpPanel />
                        )}
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-[--text-muted]">
                        Select a project to view files
                    </div>
                )}
            </div>
        </div>
    );
}

function FileIcon({ type }) {
    if (type === 'video') return <Film className="w-5 h-5 text-purple-400" />;
    if (type === 'archive') return <HardDrive className="w-5 h-5 text-yellow-400" />;
    if (type === 'model') return <Database className="w-5 h-5 text-blue-400" />;
    return <FileCode className="w-5 h-5 text-[--text-secondary]" />;
}

function AnnexHelpPanel() {
    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-b from-white to-slate-50">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-6">
                <div className="flex items-start gap-4">
                    <div className="rounded-2xl bg-white p-3 text-emerald-600 shadow-sm">
                        <BookOpen className="w-6 h-6" />
                    </div>
                    <div className="space-y-3">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Working with large files in ClusterGit</h3>
                            <p className="text-sm leading-6 text-slate-600 mt-1">
                                ClusterGit uses <span className="font-semibold text-slate-900">git-annex</span> for large file handling.
                                Use the commands below when you want to stage, sync, download, or push large assets cleanly.
                            </p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                            <QuickStep
                                step="1"
                                title="Stage large files"
                                description="Use git annex add before committing large assets."
                            />
                            <QuickStep
                                step="2"
                                title="Commit normally"
                                description="Use git commit exactly like a standard Git workflow."
                            />
                            <QuickStep
                                step="3"
                                title="Sync file content"
                                description="Use annex push, pull, get, or sync depending on what you need."
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                {ANNEX_COMMANDS.map((command) => (
                    <CommandCard key={command.name} command={command} />
                ))}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="text-base font-semibold text-slate-900 mb-4">Helpful links</h3>
                <div className="grid gap-3 md:grid-cols-2">
                    <ExternalHelpLink
                        href="https://git-annex.branchable.com/install/"
                        label="git-annex install page"
                    />
                    <ExternalHelpLink
                        href="https://git-annex.branchable.com/git-annex/"
                        label="git-annex documentation"
                    />
                </div>
            </div>
        </div>
    );
}

function QuickStep({ step, title, description }) {
    return (
        <div className="rounded-2xl border border-emerald-200/70 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Step {step}</div>
            <div className="mt-2 font-semibold text-slate-900">{title}</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        </div>
    );
}

function CommandCard({ command }) {
    const Icon = command.icon;

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                    <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="inline-flex rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-mono text-slate-50">
                        {command.name}
                    </div>
                    <p className="mt-3 font-medium text-slate-900">{command.summary}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{command.detail}</p>
                </div>
            </div>
        </div>
    );
}

function ExternalHelpLink({ href, label }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
            <span>{label}</span>
            <ExternalLink className="w-4 h-4" />
        </a>
    );
}
