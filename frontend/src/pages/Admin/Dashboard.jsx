import { useEffect, useState } from 'react';
import { adminService } from '../../services/adminService';
import { Activity, Server, HardDrive, Users, Archive } from 'lucide-react';

export default function AdminDashboard() {
    const [summary, setSummary] = useState(null);
    const [nodes, setNodes] = useState([]);
    const [error, setError] = useState('');

    useEffect(() => {
        const load = async () => {
            try {
                const [summaryData, nodeData] = await Promise.all([
                    adminService.getSummary(),
                    adminService.getNodes()
                ]);
                setSummary(summaryData);
                setNodes(nodeData || []);
            } catch (err) {
                setError(err.message || 'Failed to load admin dashboard');
            }
        };

        load();
    }, []);

    if (!summary && !error) return <div className="p-10 text-center">Loading cluster status...</div>;
    if (error) return <div className="p-10 text-center text-red-500">{error}</div>;

    const formatBytes = (bytes) => {
        const value = Number(bytes) || 0;
        if (value >= 1024 ** 3) return `${(value / (1024 ** 3)).toFixed(2)} GB`;
        if (value >= 1024 ** 2) return `${(value / (1024 ** 2)).toFixed(1)} MB`;
        if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
        return `${value} B`;
    };

    const onlineNodes = nodes.filter(n => n.status === 'online').length;
    const totalNodes = nodes.length;
    const storageUsed = formatBytes(summary?.used_storage_bytes || 0);
    const storageTotal = formatBytes(summary?.total_storage_bytes || 0);
    const archivedRepos = summary?.archived_repositories || [];

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Cluster Health</h1>
                <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-[--status-success] animate-pulse" />
                    <span className="text-[--status-success] font-medium">System Online</span>
                </div>
            </div>

            {/* Vital Signs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <MetricCard label="Health Score" value={summary?.health || 'N/A'} icon={Activity} color="text-[--status-success]" />
                <MetricCard
                    label="Active Nodes"
                    value={`${onlineNodes}/${totalNodes}`}
                    icon={Server}
                    color="text-blue-400"
                />
                <MetricCard label="Storage Used" value={storageUsed} sub={`of ${storageTotal}`} icon={HardDrive} color="text-purple-400" />
                <MetricCard label="Active Users" value={String(summary?.active_users ?? 0)} icon={Users} color="text-orange-400" />
            </div>

            {/* Nodes Quick View */}
            <div className="card p-6">
                <h2 className="text-lg font-semibold mb-6">Node Status Map</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                    {nodes.map(node => (
                        <div
                            key={node.id}
                            className="flex flex-col items-center p-4 rounded-lg bg-[--bg-tertiary] border border-[--border-color]"
                        >
                            <div
                                className={`w-3 h-3 rounded-full mb-3 ${
                                    node.status === 'online'
                                        ? 'bg-[--status-success]'
                                        : node.status === 'warning'
                                        ? 'bg-[--status-warning]'
                                        : 'bg-[--status-error]'
                                }`}
                            />
                            <Server className="w-8 h-8 text-[--text-muted] mb-2" />
                            <span className="font-mono text-sm">{node.id}</span>
                            <span className="text-xs text-[--text-secondary] mt-1">{node.cpu}% CPU</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Alert Feed Mockup */}
            <div className="card p-6 border-l-4 border-l-[--status-warning]">
                <h2 className="text-lg font-semibold mb-4 text-[--status-warning]">Recent Alerts</h2>
                <div className="space-y-2">
                    {(summary?.recent_activity || []).slice(0, 2).map((item, idx) => (
                        <div key={`${item.created_at || idx}`} className="flex justify-between text-sm">
                            <span>{item.detail}</span>
                            <span className="text-[--text-muted]">{item.project}</span>
                        </div>
                    ))}
                    {(summary?.recent_activity || []).length === 0 && (
                        <div className="text-sm text-[--text-muted]">No recent activity recorded.</div>
                    )}
                </div>
            </div>

            {/* Archived Repositories */}
            <div className="card p-6">
                <div className="flex items-center gap-2 mb-6">
                    <Archive className="w-5 h-5 text-[--text-muted]" />
                    <h2 className="text-lg font-semibold">Archived Repositories</h2>
                </div>

                <div className="space-y-3">
                    {archivedRepos.map(repo => (
                        <div
                            key={repo.name}
                            className="flex justify-between items-center p-4 rounded-lg bg-[--bg-tertiary] border border-[--border-color] hover:bg-[--bg-secondary] transition-colors"
                        >
                            <div>
                                <p className="font-mono text-sm">{repo.name}</p>
                                <p className="text-xs text-[--text-muted] mt-1">Archived snapshot</p>
                            </div>
                            <span className="text-xs text-[--text-secondary]">{formatBytes(repo.size_bytes || 0)}</span>
                        </div>
                    ))}
                    {archivedRepos.length === 0 && (
                        <div className="text-sm text-[--text-muted]">No archived repositories detected.</div>
                    )}
                </div>
            </div>
        </div>
    );
}

function MetricCard({ label, value, sub, icon: Icon, color }) {
    return (
        <div className="card p-6">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <p className="text-[--text-secondary] text-sm font-medium">{label}</p>
                    <h3 className="text-2xl font-bold mt-1">{value}</h3>
                    {sub && <p className="text-xs text-[--text-muted] mt-1">{sub}</p>}
                </div>
                <div className={`p-2 rounded-lg bg-[--bg-primary] ${color}`}>
                    <Icon className="w-6 h-6" />
                </div>
            </div>
        </div>
    );
}
