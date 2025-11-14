#!/bin/bash
# This hook runs before accepting a push - for authentication

# Read the input from git
while read oldrev newrev refname; do
    # Extract repo name from refname (e.g., refs/heads/main → repo-name)
    REPO_NAME=$(basename $(pwd) .git)
    
    # Get user ID from environment (set by your SSH config)
    USER_ID="$USER_ID"
    
    if [ -z "$USER_ID" ]; then
        echo "❌ Authentication error: No user ID provided"
        exit 1
    fi
    
    # Check if user can access this repo
    python3 /path/to/scripts/check_access.py "$USER_ID" "$REPO_NAME"
    
    if [ $? -ne 0 ]; then
        echo "❌ Permission denied: You don't have access to repository '$REPO_NAME'"
        exit 1
    fi
    
    echo "✅ Access granted for user $USER_ID to repo $REPO_NAME"
done

exit 0