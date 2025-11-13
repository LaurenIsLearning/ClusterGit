from setuptools import setup

setup(
    name="cluster-git",
    version="0.1.0",
    py_modules=["ClusterGit"],
    install_requires=["click"],
    entry_points={
        "console_scripts": [
            "clustergit=ClusterGit:cli",
        ],
    },
)