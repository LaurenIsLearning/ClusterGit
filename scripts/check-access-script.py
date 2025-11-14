#!/usr/bin/env python3
import sys
from repo_metadata import RepoMetadataManager

def main():
    if len(sys.argv) != 3:
        print("Usage: check_access.py <user_id> <repo_name>")
        sys.exit(1)
    
    user_id = sys.argv[1]
    repo_name = sys.argv[2]
    
    manager = RepoMetadataManager()
    has_access = manager.can_user_access_repo(user_id, repo_name)
    
    sys.exit(0 if has_access else 1)

if __name__ == "__main__":
    main()