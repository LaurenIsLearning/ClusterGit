import { useState, useEffect } from 'react';
import { projectService } from '../../services/projectService';
import { FolderGit2, FileCode, Film, Database, HardDrive, Plus, MoreVertical, Github, Copy, Check, Image, FileText, File } from 'lucide-react';
import UploadModal from '../../components/UploadModal';
import NewProjectModal from '../../components/NewProjectModal';
import ConfirmationModal from '../../components/ConfirmationModal';
import { useToast } from '../../context/ToastContext';

export default function StudentProjects() {
    const [projects, setProjects] = useState([]);
    const [selectedProject, setSelectedProject] = useState(null);
    const [files, setFiles] = useState([]);
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

    useEffect(() => {
        if (!selectedProject) {
            setFiles([]);
            return;
        }

        let cancelled = false;
        let isFirstLoad = true;

        const loadFiles = async () => {
            // Skip while the tab is hidden. Avoids burst-fire of queued ticks
            // on refocus and avoids racing with Supabase token refresh.
            if (document.hidden) return;

            try {
                const data = await projectService.getProjectFiles(selectedProject);
                if (cancelled) return;

                const normalized = (data || []).map((file) => ({
                    id: file.id,
                    name: file.name,
                    path: file.path || file.name,
                    size: formatSize(file.size_bytes),
                    type: file.type || 'unknown',
                    status: file.status || 'synced',
                }));

                // Only overwrite files on the first load, or when the server
                // actually has results. A transient empty response from a poll
                // should not wipe a populated list.
                setFiles((prev) => {
                    if (isFirstLoad) return normalized;
                    if (normalized.length === 0 && prev.length > 0) return prev;
                    return normalized;
                });
            } catch (error) {
                if (cancelled) return;
                console.error('Failed to load files:', error);
                if (isFirstLoad) {
                    addToast(error.message || 'Failed to load project files', 'error');
                    setFiles([]);
                }
            } finally {
                isFirstLoad = false;
            }
        };

        loadFiles();
        const intervalId = setInterval(loadFiles, 10_000);

        // Immediately refresh when the tab becomes visible again so the user
        // sees current state without waiting up to 10 seconds.
        const handleVisibility = () => {
            if (!document.hidden) loadFiles();
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            cancelled = true;
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
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
                {currentProject ? (
                    <>
                        {/* Toolbar */}
                        <div className="p-6 border-b border-[--border-color] flex justify-between items-center bg-[--bg-secondary] gap-4">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    {currentProject.name}
                                    <span className="text-xs px-2 py-1 rounded bg-[--bg-tertiary] text-[--text-muted] font-normal">Active</span>
                                </h2>
                                <p className="text-sm text-[--text-secondary] mt-1">{files.length} file{files.length !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="flex items-center gap-3">
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
                            </div>
                        </div>

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
                                                No files in this repository yet.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
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
    if (type === 'image') return <Image className="w-5 h-5 text-green-400" />;
    if (type === 'document') return <FileText className="w-5 h-5 text-orange-400" />;
    if (type === 'code') return <FileCode className="w-5 h-5 text-cyan-400" />;
    return <File className="w-5 h-5 text-[--text-secondary]" />;
}
