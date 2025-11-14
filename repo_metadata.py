from supabase_client import get_supabase_client
import uuid
from datetime import datetime

class RepoMetadataManager:
    def __init__(self):
        self.supabase = get_supabase_client()
    
    def create_repo_record(self, repo_name: str, owner_id: str, git_annex_uuid: str, is_public: bool = False):
        """Create a new repository record in Supabase"""
        try:
            data = {
                "name": repo_name,
                "owner_id": owner_id,
                "git_annex_uuid": git_annex_uuid,
                "is_public": is_public,
                "created_at": datetime.utcnow().isoformat()
            }
            
            result = self.supabase.table("repositories").insert(data).execute()
            
            if result.data:
                logger.info(f"✅ Created repo record: {repo_name} for user {owner_id}")
                return result.data[0]
            else:
                logger.error(f"❌ Failed to create repo record: {result.error}")
                return None
                
        except Exception as e:
            logger.error(f"❌ Error creating repo record: {e}")
            return None
    
    def get_user_repos(self, user_id: str):
        """Get all repositories a user has access to"""
        try:
            # Get repos user owns
            owned_repos = self.supabase.table("repositories")\
                .select("*")\
                .eq("owner_id", user_id)\
                .execute()
            
            # Get repos user collaborates on
            collab_repos = self.supabase.table("collaborators")\
                .select("repo_id")\
                .eq("user_id", user_id)\
                .execute()
            
            collab_repo_ids = [item["repo_id"] for item in collab_repos.data] if collab_repos.data else []
            
            # Get details of collaborative repos
            if collab_repo_ids:
                collab_repo_details = self.supabase.table("repositories")\
                    .select("*")\
                    .in_("id", collab_repo_ids)\
                    .execute()
                all_repos = owned_repos.data + collab_repo_details.data
            else:
                all_repos = owned_repos.data
            
            logger.info(f"✅ Retrieved {len(all_repos)} repos for user {user_id}")
            return all_repos
            
        except Exception as e:
            logger.error(f"❌ Error getting user repos: {e}")
            return []
    
    def can_user_access_repo(self, user_id: str, repo_name: str) -> bool:
        """Check if user has access to a repository"""
        try:
            # Check if user owns the repo
            owned_repo = self.supabase.table("repositories")\
                .select("id")\
                .eq("name", repo_name)\
                .eq("owner_id", user_id)\
                .execute()
            
            if owned_repo.data:
                return True
            
            # Check if user is a collaborator
            repo_info = self.supabase.table("repositories")\
                .select("id")\
                .eq("name", repo_name)\
                .execute()
            
            if not repo_info.data:
                return False
                
            repo_id = repo_info.data[0]["id"]
            
            collaboration = self.supabase.table("collaborators")\
                .select("user_id")\
                .eq("repo_id", repo_id)\
                .eq("user_id", user_id)\
                .execute()
            
            has_access = bool(collaboration.data)
            logger.info(f"✅ Access check: user {user_id} → repo {repo_name} = {has_access}")
            return has_access
            
        except Exception as e:
            logger.error(f"❌ Error checking repo access: {e}")
            return False
    
    def update_repo_after_push(self, repo_name: str, user_id: str, commit_hash: str):
        """Update repository metadata after a successful push"""
        try:
            # For now, just log the push - you can extend this later
            logger.info(f"📝 Push recorded: repo={repo_name}, user={user_id}, commit={commit_hash}")
            
            # You could add a 'last_push_at' field to repositories table later
            # result = self.supabase.table("repositories")\
            #     .update({"last_push_at": datetime.utcnow().isoformat()})\
            #     .eq("name", repo_name)\
            #     .execute()
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Error updating repo after push: {e}")
            return False

# Example usage
if __name__ == "__main__":
    manager = RepoMetadataManager()
    
    # Test creating a repo
    test_repo = manager.create_repo_record(
        repo_name="test-repo",
        owner_id="test-user-id",
        git_annex_uuid=str(uuid.uuid4())
    )
    print("Created repo:", test_repo)