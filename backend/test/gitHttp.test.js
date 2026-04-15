import { strict as assert } from "assert";
import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import request from "supertest";

import app from "../src/app.js";
import gitService from "../src/services/gitService.js";

const execFileAsync = promisify(execFile);
const GIT_BIN = process.platform === "win32" ? "git" : "/usr/bin/git";

describe("Git HTTP Routes", function () {
    this.timeout(15000);

    const userId = "git-http-test-user";
    const repoName = "git-http-test-repo";
    const repoPath = gitService.getRepoPath(userId, repoName);

    afterEach(async function () {
        try {
            await fs.rm(path.dirname(repoPath), { recursive: true, force: true });
        } catch {
            // cleanup should never fail the suite
        }
    });

    it("returns 404 when the requested repository storage does not exist", async function () {
        const res = await request(app)
            .get(`/git/${userId}/${repoName}.git/info/refs`)
            .query({ service: "git-upload-pack" });

        assert.equal(res.status, 404);
        assert.match(res.text, /repository not found/i);
    });

    it("returns 200 for an existing bare repository", async function () {
        await fs.mkdir(path.dirname(repoPath), { recursive: true });
        await execFileAsync(GIT_BIN, ["init", "--bare", repoPath]);
        await execFileAsync(GIT_BIN, ["symbolic-ref", "HEAD", "refs/heads/main"], { cwd: repoPath });

        const res = await request(app)
            .get(`/git/${userId}/${repoName}.git/info/refs`)
            .query({ service: "git-upload-pack" });

        assert.equal(res.status, 200);
        assert.match(
            String(res.headers["content-type"] || ""),
            /application\/x-git-upload-pack-advertisement/i
        );
    });
});
