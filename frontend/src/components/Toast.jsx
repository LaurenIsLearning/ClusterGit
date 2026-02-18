import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { useEffect } from 'react';

export default function Toast({ message, type = 'info', onClose }) {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 5000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const styles = {
        success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500',
        error: 'bg-red-500/10 border-red-500/20 text-red-500',
        info: 'bg-blue-500/10 border-blue-500/20 text-blue-500',
        warning: 'bg-amber-500/10 border-amber-500/20 text-amber-500',
    };

    const icons = {
        success: CheckCircle,
        error: AlertCircle,
        info: Info,
        warning: AlertCircle,
    };

    const Icon = icons[type];

    return (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg backdrop-blur-md animate-fade-in mb-3 min-w-[300px] ${styles[type]}`}>
            <Icon className="w-5 h-5 shrink-0" />
            <span className="flex-1 text-sm font-medium">{message}</span>
            <button onClick={onClose} className="hover:opacity-70 transition-opacity">
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
