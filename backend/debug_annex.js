import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function debugAnnexUuid(repoPath) {
    console.log('Repo path:', repoPath);
    try {
        const { stdout, stderr } = await execAsync('git annex info --json', { cwd: repoPath });
        console.log('STDOUT:', stdout);
        console.log('STDERR:', stderr);
        const info = JSON.parse(stdout);
        console.log('UUID:', info.uuid);
        return info.uuid;
    } catch (error) {
        console.error('ERROR:', error);
        return null;
    }
}

const path = '/Users/aleksandrtapinsh/clustergit-repos/59f04fc1-9efc-4faa-b292-92065be508f5/test123421.git';
debugAnnexUuid(path);
