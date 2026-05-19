from setuptools import setup, find_namespace_packages
from pathlib import Path

ROOT = Path(__file__).parent
README = ROOT / "cli_anything/gitcode/README.md"


def read_readme():
    try:
        return README.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


setup(
    name="cli-anything-gitcode",
    version="1.0.0",
    author="CLI Anything Contributors",
    description="CLI harness for GitCode repositories using the real git backend",
    long_description=read_readme(),
    long_description_content_type="text/markdown",
    url="https://github.com/HKUDS/CLI-Anything",
    packages=find_namespace_packages(include=["cli_anything.*"]),
    python_requires=">=3.10",
    install_requires=[
        "click>=8.0.0",
        "prompt-toolkit>=3.0.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "pytest-cov>=4.0.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "cli-anything-gitcode=cli_anything.gitcode.gitcode_cli:main",
        ],
    },
    package_data={
        "cli_anything.gitcode": ["skills/*.md"],
    },
    include_package_data=True,
    zip_safe=False,
    keywords="cli gitcode git repository ai-agent",
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Version Control :: Git",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3 :: Only",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
)
