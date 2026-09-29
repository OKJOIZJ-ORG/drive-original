"""Read-only Windows memory snapshot; no process arguments, credentials or settings."""
import ctypes
from ctypes import wintypes
from datetime import datetime, timezone
import json

class MEMORYSTATUSEX(ctypes.Structure):
    _fields_ = [("dwLength", wintypes.DWORD), ("dwMemoryLoad", wintypes.DWORD)] + [
        (name, ctypes.c_ulonglong) for name in (
            "ullTotalPhys", "ullAvailPhys", "ullTotalPageFile", "ullAvailPageFile",
            "ullTotalVirtual", "ullAvailVirtual", "ullAvailExtendedVirtual")]

class PERFORMANCE_INFORMATION(ctypes.Structure):
    _fields_ = [("cb", wintypes.DWORD)] + [(name, ctypes.c_size_t) for name in (
        "CommitTotal", "CommitLimit", "CommitPeak", "PhysicalTotal", "PhysicalAvailable",
        "SystemCache", "KernelTotal", "KernelPaged", "KernelNonpaged", "PageSize")] + [
        (name, wintypes.DWORD) for name in ("HandleCount", "ProcessCount", "ThreadCount")]

memory = MEMORYSTATUSEX()
memory.dwLength = ctypes.sizeof(memory)
kernel = ctypes.WinDLL("kernel32", use_last_error=True)
kernel.GlobalMemoryStatusEx.argtypes = [ctypes.POINTER(MEMORYSTATUSEX)]
kernel.GlobalMemoryStatusEx.restype = wintypes.BOOL
if not kernel.GlobalMemoryStatusEx(ctypes.byref(memory)):
    raise ctypes.WinError(ctypes.get_last_error())
performance = PERFORMANCE_INFORMATION()
performance.cb = ctypes.sizeof(performance)
psapi = ctypes.WinDLL("psapi", use_last_error=True)
psapi.GetPerformanceInfo.argtypes = [ctypes.POINTER(PERFORMANCE_INFORMATION), wintypes.DWORD]
psapi.GetPerformanceInfo.restype = wintypes.BOOL
if not psapi.GetPerformanceInfo(ctypes.byref(performance), performance.cb):
    raise ctypes.WinError(ctypes.get_last_error())
gib = lambda value: round(value / (1024 ** 3), 3)
page = performance.PageSize
result = {
    "observedAt": datetime.now(timezone.utc).isoformat(),
    "physicalTotalGiB": gib(memory.ullTotalPhys), "physicalAvailableGiB": gib(memory.ullAvailPhys),
    "memoryLoadPercent": memory.dwMemoryLoad,
    "commitUsedGiB": gib(performance.CommitTotal * page),
    "commitLimitGiB": gib(performance.CommitLimit * page),
    "commitAvailableGiB": gib((performance.CommitLimit - performance.CommitTotal) * page),
    "processCount": performance.ProcessCount, "threadCount": performance.ThreadCount,
    "scope": "Single observed host snapshot; does not prove a Chrome/WASM crash cause."
}
print(json.dumps(result, indent=2))
