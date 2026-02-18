import { useState, useEffect, useRef } from 'react';
import { X, File, CheckCircle2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useToast } from '../context/ToastContext';

export default function UploadModal({ project, isOpen, onClose, onComplete }) {
    const { addToast } = useToast();
    const [file, setFile] = useState(null);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('idle'); // idle, uploading, complete
    const uploadInterval = useRef(null);

    useEffect(() => {
        if (!isOpen) {
            setFile(null);
            setProgress(0);
            setStatus('idle');
            if (uploadInterval.current) clearInterval(uploadInterval.current);
        }
    }, [isOpen]);

    const handleFileChange = (e) => {
        if (e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const cancelUpload = () => {
        if (uploadInterval.current) clearInterval(uploadInterval.current);
        setStatus('idle');
        setProgress(0);
        addToast('Upload cancelled', 'info');
    };

    const startUpload = () => {
        if (!file) return;
        setStatus('uploading');
        addToast(`Starting upload for ${file.name}...`, 'info');

        let current = 0;
        uploadInterval.current = setInterval(() => {
            current += Math.random() * 5 + 2; // Random increment
            if (current >= 100) {
                current = 100;
                clearInterval(uploadInterval.current);
                setStatus('complete');
                addToast('File uploaded successfully', 'success');
                setTimeout(() => {
                    onComplete(file);
                    onClose();
                }, 1000);
            }
            setProgress(current);
        }, 200);
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md bg-[--bg-secondary] border border-[--border-color] rounded-xl shadow-2xl p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">Upload to {project}</h2>
                    <button onClick={onClose}><X className="w-5 h-5" /></button>
                </div>

                {status === 'idle' ? (
                    <div className="space-y-4">
                        <div className="border-2 border-dashed border-[--border-color] rounded-lg p-8 text-center hover:bg-[--bg-tertiary] transition-colors">
                            <input
                                type="file"
                                id="file-upload"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                            <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2">
                                <div className="p-3 bg-[--bg-primary] rounded-full">
                                    <File className="w-6 h-6 text-[--accent-primary]" />
                                </div>
                                <span className="font-medium">Click to select a large file</span>
                                <span className="text-sm text-[--text-secondary]">Max size: 10GB</span>
                            </label>
                        </div>

                        {file && (
                            <div className="flex items-center justify-between p-3 bg-[--bg-tertiary] rounded-md">
                                <span className="text-sm truncate max-w-[200px]">{file.name}</span>
                                <span className="text-xs text-[--text-muted]">{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-4">
                            <button onClick={onClose} className="btn btn-ghost">Cancel</button>
                            <button
                                onClick={startUpload}
                                disabled={!file}
                                className="btn btn-primary"
                            >
                                Start Upload
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 py-4">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-[--accent-primary]/10 rounded-full">
                                {status === 'complete' ? (
                                    <CheckCircle2 className="w-6 h-6 text-[--status-success]" />
                                ) : (
                                    <File className="w-6 h-6 text-[--accent-primary] animate-pulse" />
                                )}
                            </div>
                            <div className="flex-1">
                                <h3 className="font-medium truncate">{file.name}</h3>
                                <p className="text-sm text-[--text-secondary]">
                                    {status === 'uploading' ? 'Uploading shards...' : 'Upload Complete'}
                                </p>
                            </div>
                            {status === 'uploading' && (
                                <button onClick={cancelUpload} className="btn btn-ghost text-sm text-[--status-error] hover:bg-[--status-error]/10">
                                    Cancel
                                </button>
                            )}
                        </div>

                        <div className="space-y-2">
                            <div className="h-2 w-full bg-[--bg-tertiary] rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-200 ${status === 'complete' ? 'bg-[--status-success]' : 'bg-[--accent-primary]'
                                        }`}
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-xs text-[--text-muted]">
                                <span>{progress.toFixed(0)}%</span>
                                <span>{status === 'uploading' ? 'Calculating...' : 'Done'}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
