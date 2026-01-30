# System Workflow Diagrams

## 1. Student Upload Flow
This diagram illustrates the process of uploading a large file, including logic for quota enforcement, user cancellation, and error handling.

```mermaid
flowchart TD
    Start([User Clicks Upload]) --> SelectFile[/Select File/]
    SelectFile --> CheckSize{File > Limit?}
    
    CheckSize -- Yes --> ErrorSize[Show Error: File Too Large]
    ErrorSize --> End([End])
    
    CheckSize -- No --> CheckQuota{Quota Exceeded?}
    
    CheckQuota -- Yes --> WarningQuota[Show Toast: Quota Limit Reached]
    WarningQuota --> End
    
    CheckQuota -- No --> InitUpload[Initialize Upload]
    InitUpload --> UploadLoop{Uploading...}
    
    UploadLoop -- In Progress --> ShowProgress[Update Progress Bar]
    ShowProgress --> CheckCancel{User Cancelled?}
    
    CheckCancel -- Yes --> CancelAction[Abort Upload]
    CancelAction --> ToastCancel[Show Toast: Upload Cancelled]
    ToastCancel --> End
    
    CheckCancel -- No --> SimFail{Simulate Failure?}
    
    SimFail -- Yes --> ErrorNet[Show Toast: Network Error]
    ErrorNet --> RetryOption{Retry?}
    RetryOption -- Yes --> InitUpload
    RetryOption -- No --> End
    
    SimFail -- No --> CheckDone{Progress = 100%?}
    
    CheckDone -- No --> UploadLoop
    CheckDone -- Yes --> SuccessAction[Finalize File Entry]
    SuccessAction --> ToastSuccess[Show Toast: Upload Complete]
    ToastSuccess --> End
    
    style WarningQuota fill:#f9f,stroke:#333,stroke-width:2px
    style ToastCancel fill:#ff9,stroke:#333,stroke-width:2px
    style ErrorNet fill:#f99,stroke:#333,stroke-width:2px
```

## 2. Admin Quota Management Flow
This diagram details the administrative workflow for monitoring user storage and resetting quotas, emphasizing the "Error Prevention" (H5) confirmation step.

```mermaid
flowchart TD
    Start([Admin Views Users]) --> LoadData[Fetch User List]
    LoadData --> DisplayTable[Render User Table]
    
    DisplayTable --> Action{Admin Action}
    Action -- View Usage --> Tooltip[Hover: Storage %]
    Action -- Filter/Search --> FilterList[Update Table View]
    
    Action -- Reset Quota --> ClickReset[Click 'Reset Quota']
    ClickReset --> ShowModal{Confirmation Modal}
    
    ShowModal -- Cancel/Close --> CloseModal[Close Modal]
    CloseModal --> DisplayTable
    
    ShowModal -- Confirm --> InitReset[Processing Reset...]
    
    InitReset --> SimError{Simulate API Error?}
    
    SimError -- Yes --> ToastError[Show Toast: Reset Failed]
    ToastError --> DisplayTable
    
    SimError -- No --> Success[Update User State]
    Success --> ToastSuccess[Show Toast: Quota Reset Successfully]
    ToastSuccess --> UpdateUI[Refetch/Update Table Row]
    
    style ShowModal fill:#f9f,stroke:#333,stroke-width:2px
    style ToastSuccess fill:#9f9,stroke:#333,stroke-width:2px
    style ToastError fill:#f99,stroke:#333,stroke-width:2px
```

## 3. Student File History & Version Control Flow
This diagram illustrates the user journey for managing file versions, covering the requirements for "User Control and Freedom" (H3) via the ability to revert changes.

```mermaid
flowchart TD
    Start([User Selects File]) --> ClickAction[Click 'Actions' Menu]
    ClickAction --> SelectHistory[Select 'View History']
    
    SelectHistory --> LoadVersions[Fetch Version List]
    LoadVersions --> ShowTimeline[Display Version Timeline]
    
    ShowTimeline --> UserChoice{User Selection}
    
    UserChoice -- View --> ViewContent[Open File Preview]
    ViewContent --> Back[Back to Timeline]
    
    UserChoice -- Compare --> DiffView[Show Diff vs Current]
    DiffView --> Back
    
    UserChoice -- Revert --> ClickRevert[Click 'Revert to Version']
    ClickRevert --> ConfirmRevert{Confirmation Modal}
    
    ConfirmRevert -- Cancel --> Back
    ConfirmRevert -- Confirm --> ProcessRevert[Restoring Version...]
    
    ProcessRevert --> RevertSuccess[Update Main File Pointer]
    RevertSuccess --> ToastRevert[Show Toast: File Reverted]
    ToastRevert --> UpdateList[Refresh File List]
    
    style ConfirmRevert fill:#f9f,stroke:#333,stroke-width:2px
    style ToastRevert fill:#9f9,stroke:#333,stroke-width:2px
    style DiffView fill:#ddf,stroke:#333,stroke-width:2px
```
