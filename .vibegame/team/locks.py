"""Advisory file locks for the local team runtime."""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

# Windows 没有 fcntl：退化为 O_CREAT 独占创建锁（本仓 Windows 补丁，同 run.py GBK 补丁先例）。
# task create/list 是纯文件操作，串行使用；锁只防并发写坏 JSON。
try:
    import fcntl
except ImportError:  # pragma: no cover - Windows
    fcntl = None


@contextmanager
def file_lock(path: Path) -> Iterator[None]:
    path.parent.mkdir(parents=True, exist_ok=True)
    if fcntl is None:
        lock_path = path.with_suffix(path.suffix + ".lock")
        handle = open(lock_path, "x")
        try:
            yield
        finally:
            handle.close()
            lock_path.unlink(missing_ok=True)
        return
    with open(path, "a+", encoding="utf-8") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
