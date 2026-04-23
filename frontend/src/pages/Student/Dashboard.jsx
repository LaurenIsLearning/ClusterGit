import { useEffect, useState } from 'react';
import { projectService } from '../../services/projectService';
import { Clock, Database } from 'lucide-react';

function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value <= 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const unitIndex = Math.min(
        Math.floor(Math.log(value) / Math.log(1024)),
        units.length - 1
    );
    const amount = value / (1024 ** unitIndex);
    const precision = amount >= 10 || unitIndex === 0 ? 0 : 1;

    return `${amount.toFixed(precision)} ${units[unitIndex]}`;
}

export default function StudentDashboard() {
    const [quota, setQuota] = useState({ used: 0, total: 20 * 1024 * 1024 * 1024 });
    const [activity, setActivity] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const load = async () => {
            try {
                const data = await projectService.getDashboardSummary();
                setQuota(data?.quota || { used: 0, total: 20 * 1024 * 1024 * 1024 });
                setActivity(data?.recent_activity || []);
            } catch (err) {
                setError(err.message || 'Failed to load dashboard summary');
            } finally {
                setLoading(false);
            }
        };

        load();
    }, []);

    if (loading) return <div className="p-10 text-center">Loading dashboard...</div>;

    if (error) return <div className="p-10 text-center text-red-500">{error}</div>;

    const usedPercent = quota.total > 0 ? Math.min(100, (quota.used / quota.total) * 100) : 0;
    const visibleUsedPercent = quota.used > 0 && usedPercent < 0.5 ? 0.5 : usedPercent;
    const usedPercentLabel = quota.used > 0 && usedPercent < 0.1 ? '<0.1' : usedPercent.toFixed(1);

    const formatRelativeTime = (iso) => {
        if (!iso) return 'just now';
        const timeMs = new Date(iso).getTime();
        if (Number.isNaN(timeMs)) return 'just now';
        const deltaSeconds = Math.floor((Date.now() - timeMs) / 1000);
        if (deltaSeconds < 60) return 'just now';
        const minutes = Math.floor(deltaSeconds / 60);
        if (minutes < 60) return `${minutes} min ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} hr ago`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
        const months = Math.floor(days / 30);
        if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
        const years = Math.floor(months / 12);
        return `${years} year${years === 1 ? '' : 's'} ago`;
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold mb-2">Welcome back</h1>
                    <p className="text-[--text-secondary]">Here is an overview of your storage usage.</p>
                </div>
            </div>

            {/* Storage Quota Card */}
            <div className="card p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Database className="w-5 h-5 text-emerald-600" />
                        Storage Quota
                    </h2>
                    <span className="text-sm font-medium text-slate-600">
                        {formatBytes(quota.used)} / {formatBytes(quota.total)}
                    </span>
                </div>

                <div className="mb-4">
                    <div className="h-4 w-full bg-emerald-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-emerald-600 transition-all duration-1000 ease-out shadow-sm"
                            style={{ width: `${visibleUsedPercent}%` }}
                        />
                    </div>
                </div>

                <div className="flex justify-between text-sm text-slate-500 font-medium">
                    <span>{usedPercentLabel}% Used</span>
                    <span>{(100 - usedPercent).toFixed(1)}% Available</span>
                </div>
            </div>

            {/* Activity Feed */}
            <div className="card p-6">
                <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-[--text-muted]" />
                    Recent Activity
                </h2>
                <div className="space-y-6">
                    {activity.length === 0 && (
                        <p className="text-sm text-[--text-secondary]">No recent activity yet.</p>
                    )}
                    {activity.map((item) => (
                        <div key={item.id} className="flex gap-4 items-start">
                            <div className="h-2 w-2 mt-2 rounded-full bg-[--accent-primary]" />
                            <div>
                                <p className="font-medium">{item.detail || item.event_type}</p>
                                <p className="text-sm text-[--text-secondary]">{item.project} • {formatRelativeTime(item.created_at)}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
