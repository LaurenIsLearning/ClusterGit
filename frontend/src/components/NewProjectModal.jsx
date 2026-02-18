import { useState } from 'react';
import { X, FolderGit2, AlertCircle } from 'lucide-react';

export default function NewProjectModal({ isOpen, onClose, onCreateProject }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!name.trim()) {
            setError('Project name is required');
            return;
        }

        if (name.length < 3) {
            setError('Project name must be at least 3 characters');
            return;
        }

        if (name.length > 50) {
            setError('Project name must be less than 50 characters');
            return;
        }

        const validPattern = /^[a-zA-Z0-9_-]+$/;
        if (!validPattern.test(name)) {
            setError('Project name can only contain letters, numbers, hyphens, and underscores');
            return;
        }

        setIsCreating(true);
        try {
            await onCreateProject(name.trim(), description.trim());
            // Reset form
            setName('');
            setDescription('');
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to create project');
        } finally {
            setIsCreating(false);
        }
    };

    const handleClose = () => {
        if (!isCreating) {
            setName('');
            setDescription('');
            setError('');
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-[--bg-secondary] rounded-2xl border border-[--border-color] w-full max-w-md">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-[--border-color]">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-[--bg-tertiary] flex items-center justify-center">
                            <FolderGit2 className="h-5 w-5 text-[--accent-primary]" />
                        </div>
                        <h2 className="text-xl font-bold">Create New Project</h2>
                    </div>
                    <button
                        onClick={handleClose}
                        disabled={isCreating}
                        className="p-2 hover:bg-[--bg-tertiary] rounded-lg transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500">
                            <AlertCircle className="h-5 w-5 flex-shrink-0" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Project Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="my-awesome-project"
                            className="w-full px-4 py-2.5 rounded-lg border border-[--border-color] bg-[--bg-tertiary] focus:outline-none focus:ring-2 focus:ring-[--accent-primary]"
                            disabled={isCreating}
                            autoFocus
                        />
                        <p className="text-xs text-[--text-muted] mt-1">
                            Letters, numbers, hyphens, and underscores only
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Description <span className="text-[--text-muted]">(optional)</span>
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description of your project"
                            rows={3}
                            className="w-full px-4 py-2.5 rounded-lg border border-[--border-color] bg-[--bg-tertiary] focus:outline-none focus:ring-2 focus:ring-[--accent-primary] resize-none"
                            disabled={isCreating}
                        />
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={isCreating}
                            className="btn btn-secondary flex-1"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isCreating}
                            className="btn btn-primary flex-1"
                        >
                            {isCreating ? 'Creating...' : 'Create Project'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
