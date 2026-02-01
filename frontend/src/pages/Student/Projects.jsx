import { useState, useEffect } from 'react';
import { projectService } from '../../services/projectService';
import { FolderGit2, FileCode, Film, Database, HardDrive, Plus, MoreVertical, Github } from 'lucide-react';
import UploadModal from '../../components/UploadModal';
import NewProjectModal from '../../components/NewProjectModal';
import { useToast } from '../../context/ToastContext';

export default function StudentProjects() {
    const [projects, setProjects] = useState([]);
    const [selectedProject, setSelectedProject] = useState(null);
    const [files, setFiles] = useState([]);
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const { addToast } = useToast();

    // Load projects on mount
    useEffect(() => {
        loadProjects();
    }, []);

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
            addToast('Failed to load projects', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Load files when project changes
    useEffect(() => {
        if (selectedProject) {
            // For now, files are not implemented
            // In the future, this would fetch git-annex tracked files
            setFiles([]);
        }
    }, [selectedProject]);

    const handleUploadComplete = (file) => {
        // Mock adding the file to the list
        const newFile = {
            id: `new-${Date.now()}`,
            name: file.name,
            size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
            type: 'unknown',
            status: 'synced'
        };
        setFiles(prev => [newFile, ...prev]);
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

    const handleFileAction = (fileName) => {
        addToast(`Options for ${fileName} coming soon`, 'info');
    };

    if (loading) return <div className="p-10 text-center">Loading projects...</div>;

    const currentProject = projects.find(p => p.id === selectedProject);

    return (
        <div className="flex h-[calc(100vh-8rem)] gap-6">
            <UploadModal
                project={currentProject?.name}
                isOpen={isUploadOpen}
                onClose={() => setIsUploadOpen(false)}
                onComplete={handleUploadComplete}
            />

            <NewProjectModal
                isOpen={isNewProjectOpen}
                onClose={() => setIsNewProjectOpen(false)}
                onCreateProject={handleCreateProject}
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
                            onClick={() => setSelectedProject(project.id)}
                            className={`p-4 rounded-lg border cursor-pointer transition-all ${selectedProject === project.id
                                ? 'bg-[--bg-secondary] border-[--accent-primary]'
                                : 'bg-[--bg-secondary]/50 border-transparent hover:border-[--border-color]'
                                }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-semibold">{project.name}</h3>
                                <FolderGit2 className={`w-5 h-5 ${selectedProject === project.id ? 'text-[--accent-primary]' : 'text-[--text-muted]'}`} />
                            </div>
                            <div className="text-sm text-[--text-secondary] flex items-center gap-2 mb-2">
                                <Github className="w-3 h-3" />
                                <span className="truncate">{project.repo}</span>
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
                        <div className="p-6 border-b border-[--border-color] flex justify-between items-center bg-[--bg-secondary]">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    {currentProject.name}
                                    <span className="text-xs px-2 py-1 rounded bg-[--bg-tertiary] text-[--text-muted] font-normal">Active</span>
                                </h2>
                                <p className="text-sm text-[--text-secondary] mt-1">{files.length} large files stored</p>
                            </div>
                            <button
                                onClick={() => setIsUploadOpen(true)}
                                className="btn btn-primary gap-2"
                            >
                                <Plus className="w-5 h-5" />
                                Upload File
                            </button>
                        </div>

                        {/* File List */}
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
                                            <td className="py-4 pr-4 text-right">
                                                <button onClick={() => handleFileAction(file.name)} className="p-2 hover:bg-[--bg-tertiary] rounded opacity-0 group-hover:opacity-100 transition-all">
                                                    <MoreVertical className="w-4 h-4 text-[--text-secondary]" />
                                                </button>
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
