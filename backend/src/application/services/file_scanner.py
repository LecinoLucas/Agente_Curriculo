from __future__ import annotations

import socket
import struct
from typing import Protocol

from src.core.settings import settings


class FileScanError(Exception):
    pass


class FileScanThreatFound(FileScanError):
    pass


class FileScanUnavailable(FileScanError):
    pass


class FileScanner(Protocol):
    def scan(self, *, file_name: str, content: bytes, mime_type: str) -> None:
        """Raise FileScanError when the upload must be rejected."""


class NoopScanner:
    def scan(self, *, file_name: str, content: bytes, mime_type: str) -> None:
        return None


class ClamAVScanner:
    def __init__(self, *, host: str, port: int, fail_closed: bool = True, timeout_seconds: float = 5.0) -> None:
        self.host = host
        self.port = port
        self.fail_closed = fail_closed
        self.timeout_seconds = timeout_seconds

    def scan(self, *, file_name: str, content: bytes, mime_type: str) -> None:
        try:
            response = self._scan_instream(content)
        except OSError as exc:
            if self.fail_closed:
                raise FileScanUnavailable("Scanner de arquivos indisponível") from exc
            return None

        normalized = response.lower()
        if "found" in normalized:
            raise FileScanThreatFound("Arquivo rejeitado pelo scanner de segurança")
        if "ok" not in normalized:
            if self.fail_closed:
                raise FileScanUnavailable("Resposta inválida do scanner de arquivos")
            return None

    def _scan_instream(self, content: bytes) -> str:
        with socket.create_connection((self.host, self.port), timeout=self.timeout_seconds) as sock:
            sock.settimeout(self.timeout_seconds)
            sock.sendall(b"zINSTREAM\0")
            for offset in range(0, len(content), 1024 * 1024):
                chunk = content[offset : offset + 1024 * 1024]
                sock.sendall(struct.pack(">I", len(chunk)))
                sock.sendall(chunk)
            sock.sendall(struct.pack(">I", 0))
            return sock.recv(4096).decode("utf-8", errors="replace")


def get_file_scanner() -> FileScanner:
    if not settings.FILE_SCAN_ENABLED:
        return NoopScanner()
    return ClamAVScanner(
        host=settings.CLAMAV_HOST,
        port=settings.CLAMAV_PORT,
        fail_closed=settings.FILE_SCAN_FAIL_CLOSED,
    )
