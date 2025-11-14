#!/bin/bash
# This hook runs after accepting a push - for metadata updates

while read oldrev newrev refname; do
    REPO_NAME=$(basename $(pwd) .git)
    USER_ID="$USER_ID"
    
    if [ -n "$USER_ID" ] && [ -n "$newrev" ]; then
        # Update metadata in Supabase
        python3 /path/to/scripts/update_after_push.py "$USER_ID" "$REPO_NAME" "$newrev" &
    fi
    
    echo "Push successful to $REPO_NAME"
    echo "Commit: $newrev"
done

exit 0