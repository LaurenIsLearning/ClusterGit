import {
    ArrowUpDown,
    BookOpen,
    Download,
    ExternalLink,
    TerminalSquare,
} from 'lucide-react';

const ANNEX_COMMANDS = [
    {
        name: 'git annex add',
        icon: TerminalSquare,
        summary: 'Stages large files for annex tracking before you commit.',
        detail: 'Use this like git add for big files. After this, commit with git commit as usual.',
    },
    {
        name: 'git annex push',
        icon: ArrowUpDown,
        summary: 'Pushes annexed file content to your repository.',
        detail: 'Use this instead of a regular git push when large file content needs to move to the cluster.',
    },
    {
        name: 'git annex pull',
        icon: Download,
        summary: 'Pulls metadata and downloads annexed content for your repo.',
        detail: 'This is especially useful right after cloning, since clone usually gives you pointers before content.',
    },
    {
        name: 'git annex get <file>',
        icon: Download,
        summary: 'Downloads one specific annexed file onto your machine.',
        detail: 'Use this when you only need one file instead of syncing the whole repository content.',
    },
    {
        name: 'git annex sync --content',
        icon: ArrowUpDown,
        summary: 'Syncs metadata and file content in both directions.',
        detail: 'Plain git annex sync mainly handles metadata. Adding --content pulls and pushes annexed file data too.',
    },
];

export default function StudentAnnexHelp() {
    return (
        <div className="space-y-6">
            <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-slate-50 p-8 shadow-sm">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm">
                        <BookOpen className="h-7 w-7" />
                    </div>
                    <div className="flex-1 space-y-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">Student Guide</p>
                            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Annex Help</h1>
                            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                                ClusterGit uses <span className="font-semibold text-slate-900">git-annex</span> to handle
                                large files safely. This page gives students a quick, clean reference for the commands they
                                are most likely to need when working with repository content on the cluster.
                            </p>
                        </div>

                        <div className="grid gap-3 md:grid-cols-3">
                            <QuickStep
                                step="1"
                                title="Add large files"
                                description="Use git annex add before you commit large assets."
                            />
                            <QuickStep
                                step="2"
                                title="Commit normally"
                                description="Use git commit just like a standard Git workflow."
                            />
                            <QuickStep
                                step="3"
                                title="Sync content"
                                description="Use annex push, pull, get, or sync depending on what you need."
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                {ANNEX_COMMANDS.map((command) => (
                    <CommandCard key={command.name} command={command} />
                ))}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-semibold text-slate-900">Helpful Links</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                    Use these links if you need installation steps or full command documentation outside the app.
                </p>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <ExternalHelpLink
                        href="https://git-annex.branchable.com/install/"
                        label="git-annex install page"
                    />
                    <ExternalHelpLink
                        href="https://git-annex.branchable.com/git-annex/"
                        label="git-annex documentation"
                    />
                </div>
            </div>
        </div>
    );
}

function QuickStep({ step, title, description }) {
    return (
        <div className="rounded-2xl border border-emerald-200/80 bg-white px-5 py-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Step {step}</div>
            <div className="mt-2 text-base font-semibold text-slate-900">{title}</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        </div>
    );
}

function CommandCard({ command }) {
    const Icon = command.icon;

    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                    <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="inline-flex rounded-xl bg-slate-900 px-3 py-2 text-sm font-mono text-slate-50">
                        {command.name}
                    </div>
                    <p className="mt-4 text-sm font-semibold text-slate-900">{command.summary}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{command.detail}</p>
                </div>
            </div>
        </div>
    );
}

function ExternalHelpLink({ href, label }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
            <span>{label}</span>
            <ExternalLink className="h-4 w-4" />
        </a>
    );
}
