import { useEffect, useState } from 'react';
import { mockService } from '../../services/mockData';
import { Activity, Server, HardDrive, Users, Archive } from 'lucide-react';

export default function AdminDashboard() {
    const [status, setStatus] = useState(null);

    useEffect(() => {
        mockService.getClusterStatus().then(setStatus);
    }, []);

    if (!status) return <div className="p-10 text-center">Loading cluster status...</div>;

    // Mock archived repositories (replace with real data later)
    const archivedRepos = [
        { name: 'legacy-auth-service', lastCommit: '3 months ago', size: '120 MB' },
        { name: 'old-analytics-engine', lastCommit: '6 months ago', size: '340 MB' },
        { name: 'v1-mobile-backend', lastCommit: '1 year ago', size: '210 MB' }
    ];

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
                <MetricCard label="Health Score" value={status.health} icon={Activity} color="text-[--status-success]" />
                <MetricCard
                    label="Active Nodes"
                    value={`${status.nodes.filter(n => n.status === 'online').length}/${status.nodes.length}`}
                    icon={Server}
                    color="text-blue-400"
                />
                <MetricCard label="Storage Used" value={status.usedStorage} sub={`of ${status.totalStorage}`} icon={HardDrive} color="text-purple-400" />
                <MetricCard label="Active Users" value="24" icon={Users} color="text-orange-400" />
            </div>

            {/* Nodes Quick View */}
            <div className="card p-6">
                <h2 className="text-lg font-semibold mb-6">Node Status Map</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                    {status.nodes.map(node => (
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
                    <div className="flex justify-between text-sm">
                        <span>Node-03 high temperature warning (58°C)</span>
                        <span className="text-[--text-muted]">10 mins ago</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span>Node-06 connection restored</span>
                        <span className="text-[--text-muted]">45 mins ago</span>
                    </div>
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
                                <p className="text-xs text-[--text-muted] mt-1">Last commit: {repo.lastCommit}</p>
                            </div>
                            <span className="text-xs text-[--text-secondary]">{repo.size}</span>
                        </div>
                    ))}
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
