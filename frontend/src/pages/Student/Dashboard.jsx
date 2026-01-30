import { useEffect, useState } from 'react';
import { mockService } from '../../services/mockData';
import { PieChart, Clock, Database, AlertCircle } from 'lucide-react';

export default function StudentDashboard() {
    const [quota, setQuota] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        mockService.getQuota().then(data => {
            setQuota(data);
            setLoading(false);
        });
    }, []);

    if (loading) return <div className="p-10 text-center">Loading dashboard...</div>;

    const usedPercent = (quota.used / quota.total) * 100;
    const gbUsed = (quota.used / (1024 * 1024 * 1024)).toFixed(1);
    const gbTotal = (quota.total / (1024 * 1024 * 1024)).toFixed(0);

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold mb-2">Welcome back</h1>
                    <p className="text-[--text-secondary]">Here is an overview of your storage usage.</p>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Storage Quota Card */}
                <div className="card p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Database className="w-5 h-5 text-[--accent-primary]" />
                            Storage Quota
                        </h2>
                        <span className="text-sm font-medium text-[--text-muted]">{gbUsed} GB / {gbTotal} GB</span>
                    </div>

                    <div className="mb-4">
                        <div className="h-4 w-full bg-[--bg-tertiary] rounded-full overflow-hidden">
                            <div
                                className="h-full bg-[--accent-primary] transition-all duration-1000 ease-out"
                                style={{ width: `${usedPercent}%` }}
                            />
                        </div>
                    </div>

                    <div className="flex justify-between text-sm text-[--text-secondary]">
                        <span>{usedPercent.toFixed(1)}% Used</span>
                        <span>{(100 - usedPercent).toFixed(1)}% Available</span>
                    </div>
                </div>

                {/* System Status Card */}
                <div className="card p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-[--status-success]" />
                            Cluster Status
                        </h2>
                        <span className="badge badge-success">Operational</span>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center py-2 border-b border-[--border-color]">
                            <span className="text-[--text-muted]">Write Speed</span>
                            <span className="font-mono">45 MB/s</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-[--border-color]">
                            <span className="text-[--text-muted]">Read Speed</span>
                            <span className="font-mono">82 MB/s</span>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                            <span className="text-[--text-muted]">Replication</span>
                            <span className="font-mono text-[--status-success]">Synced</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Activity Feed mockup */}
            <div className="card p-6">
                <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-[--text-muted]" />
                    Recent Activity
                </h2>
                <div className="space-y-6">
                    {[
                        { action: 'Uploaded gpt_finetune.bin', time: '2 hours ago', project: 'NLP Large Models' },
                        { action: 'Synced training_data.mp4', time: '1 day ago', project: 'Computer Vision Final' },
                        { action: 'Created new project', time: '3 days ago', project: 'Graphics Dataset' }
                    ].map((item, i) => (
                        <div key={i} className="flex gap-4 items-start">
                            <div className="h-2 w-2 mt-2 rounded-full bg-[--accent-primary]" />
                            <div>
                                <p className="font-medium">{item.action}</p>
                                <p className="text-sm text-[--text-secondary]">{item.project} • {item.time}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
