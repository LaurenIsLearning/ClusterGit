import click
import subprocess
import os

@click.group()
def cli():
    pass

@cli.command(help="Uses git and git-annex to create a new repository")

#This script allows for the creation of a new git-annex repo in a specified dir
#or if unspecified the current dir.

@click.argument("directory", required=False, default=".")
@click.argument("remote", required=False)
@click.argument("remote_name", required=False, default="origin")
@click.option("-w", "--welcome", is_flag=True, help="Displays the ClusterGit logo before initializing the repo")

def gitinit(welcome, directory, remote, remote_name):
    if welcome:
        clusterGit = ("""
  ______   __                        __                           ______   __    __     
 /      \\ |  \\                      |  \\                         /      \\ |  \\  |  \\
|  $$$$$$\\| $$ __    __   _______  _| $$_     ______    ______  |  $$$$$$\\ \\$$ _| $$_   
| $$   \\$$| $$|  \\  |  \\ /       \\|   $$ \\   /      \\  /      \\ | $$ __\\$$|  \\|   $$ \\  
| $$      | $$| $$  | $$|  $$$$$$$ \\$$$$$$  |  $$$$$$\\|  $$$$$$\\| $$|    \\| $$ \\$$$$$$  
| $$   __ | $$| $$  | $$ \\$$    \\   | $$ __ | $$    $$| $$   \\$$| $$ \\$$$$| $$  | $$ __ 
| $$__/  \\| $$| $$__/ $$ _\\$$$$$$\\  | $$|  \\| $$$$$$$$| $$      | $$__| $$| $$  | $$|  \\
 \\$$    $$| $$ \\$$    $$|       $$   \\$$  $$ \\$$     \\| $$       \\$$    $$| $$   \\$$  $$
  \\$$$$$$  \\$$  \\$$$$$$  \\$$$$$$$     \\$$$$   \\$$$$$$$ \\$$        \\$$$$$$  \\$$    \\$$$$ 
""")
        click.echo(clusterGit)

    #Initializes the repo with subprocess commands
    click.echo(f"Initializing git-annex repo in: {directory}")
    subprocess.run(["git", "init", directory])
    subprocess.run(["git", "annex", "init"], cwd=directory)

    if remote:
        subprocess.run(["git", "remote", "add", remote_name, remote])

@cli.command(help="Checks the status of a givin repository")

#This script is used to check the status of a git repository

@click.option("-b", "--branch", is_flag=True, help="Check the branches of the repository")
@click.option("-f", "--fetch", is_flag=True, help="Fetches information from remote repository if applicable")
@click.argument("directory", required=False, default=".")
@click.argument("remote_name", required=False)

def status(directory, remote_name, branch, fetch):
    os.chdir(directory)
    click.echo(f"Status of: {directory}")
    subprocess.run(["git", "status"])

    if branch:
        subprocess.run(["git", "branch", "-r"])

    if fetch:
        if(not remote_name):
            print("remote_name needed!")
        else:
            subprocess.run(["git", "fetch", remote_name])

@cli.command(help="Allows the user to push specific files to a repository")

#Allows the user to push to a repository

@click.option("-m", "--message", help="Adds a commit message")
@click.option("-b", "--branch", help="Add the branch you want to commit to")
@click.argument("remote", required=False, default="origin")
@click.argument("files", nargs=-1, default=".")

def push(files, remote, message, branch):

    subprocess.run(["git", "add", *files], check=True)

    if(message):
        subprocess.run(["git", "commit", "-m", message])
    else:
        subprocess.run(["git", "commit"], check=False)
    if(branch):
        subprocess.run(["git", "push", remote, branch], check=True)
    else:
        subprocess.run(["git", "push", remote], check=True)

    subprocess.run(["git-annex", "push", remote], check=True)

@cli.command(help="Allows the user to pull from a repository")

#Allows user to pull from a remote repository

@click.option("-b", "--branch", help="The branch you want to pull from")
@click.argument("remote", required=False, default="origin")

def pull(remote, branch):

    if(branch):
        subprocess.run(["git", "pull", remote, branch], check=True)
    else:
        subprocess.run(["git", "pull", remote], check=True)

    subprocess.run(["git", "annex", "get"], check=True)

@cli.command(help="Syncs local and remote repositories")

#Allows users to run the git-annex sync command which pushes and pulls at the same time

@click.option("--content", is_flag=True, help="Force syncing annexed file contents.")
@click.argument("remote", required=False, default=None)

def sync(remote, content):

    cmd = ["git", "annex", "sync"]

    if(remote):
        cmd.append(remote)

    if(content):
        cmd.append("--content")

    subprocess.run(cmd, check=True)

if __name__ == '__main__':
    cli()

