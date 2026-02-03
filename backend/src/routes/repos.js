import express from "express";
import { supabase } from "../utils/supabase.js";
import authMiddleware from "../middleware/authMiddleware.js";
import gitService from "../services/gitService.js";

const router = express.Router();

// CREATE REPOSITORY
router.post("/create", authMiddleware, async (req, res) => {
    const { name, description } = req.body;
    const ownerId = req.user.id;

    if (!name) {
        return res.status(400).json({
            error: { message: "Project name is required" }
        });
    }

    try {
        // Validate project name
        const validation = gitService.validateProjectName(name);
        if (!validation.valid) {
            return res.status(400).json({
                error: { message: validation.error }
            });
        }

        // Check if project with same name already exists for this user
        const { data: existing } = await supabase
            .from("repositories")
            .select("id")
            .eq("owner_id", ownerId)
            .eq("name", name)
            .single();

        if (existing) {
            return res.status(400).json({
                error: { message: "A project with this name already exists" }
            });
        }

        // Create Git repository with git-annex
        const projectData = await gitService.createProject(
            ownerId,
            name,
            description || ''
        );

        // Store repository metadata in database
        // git_annex_uuid is a mandatory column in the repositories table
        const { data, error } = await supabase
            .from("repositories")
            .insert({
                name: projectData.name,
                owner_id: ownerId,
                git_annex_uuid: projectData.annexUuid,
            })
            .select()
            .single();

        if (error) {
            // Clean up created repository on database error
            console.error("Database error, cleaning up repository:", error);
            return res.status(500).json({
                error: { message: "Failed to save project metadata" }
            });
        }

        return res.json({
            success: true,
            project: data
        });

    } catch (error) {
        console.error("Project creation error:", error);
        return res.status(500).json({
            error: { message: error.message || "Failed to create project" }
        });
    }
});

// LIST USER REPOSITORIES
router.get("/my", authMiddleware, async (req, res) => {
    const ownerId = req.user.id;

    try {
        const { data, error } = await supabase
            .from("repositories")
            .select("*")
            .eq("owner_id", ownerId)
            .order("created_at", { ascending: false });

        if (error) {
            return res.status(500).json({
                error: { message: "Failed to fetch projects" }
            });
        }

        // Enrich projects with metadata not stored in DB
        const enrichedProjects = await Promise.all((data || []).map(async (project) => {
            const repoPath = gitService.getRepoPath(ownerId, project.name);
            const gitUrl = gitService.getGitUrl(ownerId, project.name);
            const size = await gitService.getRepoSize(repoPath);

            // Format for frontend expectations
            // Frontend expects: repo, size, updated
            return {
                ...project,
                repo: gitUrl,
                size: (size / (1024 * 1024)).toFixed(1) + ' MB',
                updated: new Date(project.created_at).toLocaleDateString(),
                // Also provide original values just in case
                repo_path: repoPath,
                git_url: gitUrl,
                size_bytes: size
            };
        }));

        return res.json(enrichedProjects);
    } catch (error) {
        console.error("Error fetching projects:", error);
        return res.status(500).json({
            error: { message: "Failed to fetch projects" }
        });
    }
});

export default router;