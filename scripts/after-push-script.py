#!/usr/bin/env python3
import sys
from repo_metadata import RepoMetadataManager

def main():
    if len(sys.argv) != 4:
        print("Usage: update_after_push.py <user_id> <repo_name> <commit_hash>")
        return
    
    user_id = sys.argv[1]
    repo_name = sys.argv[2]
    commit_hash = sys.argv[3]
    
    manager = RepoMetadataManager()
    manager.update_repo_after_push(repo_name, user_id, commit_hash)

if __name__ == "__main__":
    main()