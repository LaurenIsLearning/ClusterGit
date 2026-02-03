import { AlertTriangle, X } from 'lucide-react';
import { createPortal } from 'react-dom';

export default function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title = "Are you sure?",
    message = "This action cannot be undone.",
    confirmText = "Confirm",
    confirmStyle = "danger" // danger, primary
}) {
    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-sm bg-[--bg-secondary] border border-[--border-color] rounded-xl shadow-2xl p-6 scale-in-center">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${confirmStyle === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'}`}>
                            <AlertTriangle className="w-6 h-6" />
                        </div>
                        <h2 className="text-lg font-bold">{title}</h2>
                    </div>
                </div>

                <p className="text-[--text-secondary] mb-6 leading-relaxed">
                    {message}
                </p>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="btn btn-ghost hover:bg-[--bg-tertiary]"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className={`btn ${confirmStyle === 'danger' ? 'bg-red-500 hover:bg-red-600 text-white' : 'btn-primary'}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
