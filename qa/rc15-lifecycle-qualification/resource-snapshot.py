"""Read only Windows host and exact CDP-owned Chrome PIDs; never enumerate arguments."""
import contextlib, ctypes, io, json, pathlib, runpy, sys
from ctypes import wintypes

root = pathlib.Path(__file__).resolve().parents[2]
capture = io.StringIO()
with contextlib.redirect_stdout(capture):
    runpy.run_path(str(root / 'qa/host-resource-snapshot.py'))
host = json.loads(capture.getvalue())

class Counters(ctypes.Structure):
    _fields_ = [('cb', wintypes.DWORD), ('PageFaultCount', wintypes.DWORD)] + [
        (name, ctypes.c_size_t) for name in ('PeakWorkingSetSize', 'WorkingSetSize',
        'QuotaPeakPagedPoolUsage', 'QuotaPagedPoolUsage', 'QuotaPeakNonPagedPoolUsage',
        'QuotaNonPagedPoolUsage', 'PagefileUsage', 'PeakPagefileUsage', 'PrivateUsage')]

kernel = ctypes.WinDLL('kernel32', use_last_error=True)
kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
kernel.OpenProcess.restype = wintypes.HANDLE
kernel.CloseHandle.argtypes = [wintypes.HANDLE]
psapi = ctypes.WinDLL('psapi', use_last_error=True)
psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD]
rows = []
for process in json.loads(sys.argv[1] if len(sys.argv) > 1 else '[]'):
    pid = int(process['id'])
    handle = kernel.OpenProcess(0x0400 | 0x0010, False, pid)
    row = {'pid': pid, 'type': process['type'], 'observed': False}
    if handle:
        try:
            counters = Counters(); counters.cb = ctypes.sizeof(counters)
            if psapi.GetProcessMemoryInfo(handle, ctypes.byref(counters), counters.cb):
                row.update(observed=True, privateBytes=counters.PrivateUsage,
                    workingSetBytes=counters.WorkingSetSize, peakWorkingSetBytes=counters.PeakWorkingSetSize)
        finally:
            kernel.CloseHandle(handle)
    rows.append(row)
print(json.dumps({'host': host, 'processes': rows,
    'chromePrivateBytes': sum(r.get('privateBytes', 0) for r in rows),
    'chromeWorkingSetBytes': sum(r.get('workingSetBytes', 0) for r in rows)}, indent=2))
