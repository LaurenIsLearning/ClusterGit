@REM set up environment before presentation (browser with dashboards, terminal open)
setup.ps1

@REM #student logs in, creates repo, views repo
studentLoginRepo.ps1

@REM #student pushes to repo (maybe have it pull file from my flashdrive?), progress bar of upload, view repo with files after upload
@REM #it would be cool to see what node the data is stored on so i can kill that node for auto healing to see where the data goes
@REM #it should be replicated, so cool to see where that is too. this might be something for longhorn UI but unsure rn
studentPush.ps1

@REM #autoheal to show importance of autohealing
autoheal.ps1
