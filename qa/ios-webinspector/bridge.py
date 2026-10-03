"""Private, loopback-only iPhone Safari inspection bridge launcher."""
import argparse
import asyncio
import json
import socket
import subprocess
import sys
import time
import traceback
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import build_opener, ProxyHandler

ROOT = Path(__file__).resolve().parents[3]
PRIVATE = ROOT / "maintenance" / "tools" / "ios-webinspector"
PYTHON = PRIVATE / "venv312" / "Scripts" / "python.exe"
RECEIPT = PRIVATE / "bridge-process.json"
LOG = PRIVATE / "bridge.log"
HOST, PORT = "127.0.0.1", 9234
ORIGIN = "https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev"


def log_failure():
    PRIVATE.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as stream:
        traceback.print_exc(file=stream)


def identity(process):
    return {"pid": process.pid, "created": process.create_time(),
            "executable": process.exe(), "arguments": process.cmdline()}


def owned_process(record):
    import psutil
    try:
        process = psutil.Process(record["pid"])
        return process if identity(process) == record else None
    except (psutil.Error, KeyError, TypeError):
        return None


def registered_process():
    try:
        return owned_process(json.loads(RECEIPT.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        return None


def listening():
    with socket.socket() as probe:
        probe.settimeout(0.3)
        return probe.connect_ex((HOST, PORT)) == 0


def owns_listener(process):
    import psutil
    pids = {process.pid, *(child.pid for child in process.children(recursive=True))}
    return any(connection.pid in pids and connection.status == psutil.CONN_LISTEN
               and connection.laddr.ip == HOST and connection.laddr.port == PORT
               for connection in psutil.net_connections(kind="tcp"))


def get_json(endpoint, timeout=1):
    # Ignore ambient proxies: private device endpoints must stay on loopback.
    opener = build_opener(ProxyHandler({}))
    with opener.open(f"http://{HOST}:{PORT}{endpoint}", timeout=timeout) as response:
        return json.load(response)


def safari_summary(timeout=1):
    version = get_json("/json/version", timeout)
    if "safari" not in str(version.get("Browser", "")).lower():
        raise ValueError("Expected Safari inspection server")
    targets = get_json("/json/list", timeout)
    count = 0
    for target in targets:
        parsed = urlsplit(target.get("url", ""))
        if f"{parsed.scheme}://{parsed.netloc}" == ORIGIN:
            count += 1
    return count


def status():
    process = registered_process()
    if process is None:
        print("Foreign listener on loopback:9234; not adopted." if listening()
              else "Bridge stopped (no registered live process).")
        return 1
    if not owns_listener(process):
        print("Registered bridge is running; Safari endpoint is not ready.")
        return 1
    try:
        count = safari_summary()
    except Exception:
        log_failure()
        print("Registered bridge is running; Safari endpoint is not ready. Check USB/trust and Web Inspector.")
        return 1
    print(f"Safari reachable on loopback:9234; Drive Original targets: {count}.")
    return 0


def terminate_owned(record):
    import psutil
    process = owned_process(record)
    if process is None:
        return False
    # Snapshot descendants while the parent identity is verified; recheck every
    # identity before termination to avoid a recycled PID or unrelated process.
    children = [identity(child) for child in process.children(recursive=True)]
    records = [record] + list(reversed(children))
    terminated = []
    for item in records:
        candidate = owned_process(item)
        if candidate is not None:
            candidate.terminate()
            terminated.append(candidate)
    _, alive = psutil.wait_procs(terminated, timeout=3)
    for candidate in alive:
        item = next(item for item in records if item["pid"] == candidate.pid)
        verified = owned_process(item)
        if verified is not None:
            verified.kill()
    psutil.wait_procs(alive, timeout=3)
    return all(owned_process(item) is None for item in records)


def stop():
    process = registered_process()
    if process is None:
        print("No registered live bridge; no process was stopped.")
        return 0
    if terminate_owned(identity(process)):
        RECEIPT.unlink(missing_ok=True)
        print("Registered bridge stopped.")
        return 0
    print("Registered bridge did not stop; private diagnostic log retained.")
    return 1


def start():
    import psutil
    from pymobiledevice3.usbmux import list_devices
    if registered_process() is not None:
        return status()
    if listening():
        print("Foreign listener on loopback:9234; stop its owning session before starting this launcher.")
        return 1
    devices = [device for device in asyncio.run(list_devices()) if device.connection_type == "USB"]
    if len(devices) != 1:
        print(f"Exactly one USB iPhone/iPad is required (connected USB devices: {len(devices)}). Connect/unlock it and accept Trust.")
        return 1
    arguments = [str(PYTHON), "-m", "pymobiledevice3", "--reconnect", "webinspector", "cdp",
                 "--host", HOST, "--port", str(PORT), "--udid", devices[0].serial]
    PRIVATE.mkdir(parents=True, exist_ok=True)
    record = None
    try:
        with LOG.open("ab") as stream:
            child = subprocess.Popen(arguments, stdin=subprocess.DEVNULL, stdout=stream, stderr=stream,
                                     creationflags=subprocess.CREATE_NO_WINDOW, cwd=PRIVATE)
        record = identity(psutil.Process(child.pid))
        RECEIPT.write_text(json.dumps(record), encoding="utf-8")
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline and child.poll() is None:
            try:
                if owns_listener(psutil.Process(child.pid)):
                    count = safari_summary(timeout=min(1, max(0.01, (deadline - time.monotonic()) / 2)))
                    print(f"Safari reachable on loopback:9234; Drive Original targets: {count}.")
                    return 0
            except Exception:
                pass
            time.sleep(min(0.25, max(0, deadline - time.monotonic())))
        raise RuntimeError("Safari bridge startup timed out or exited")
    except Exception:
        log_failure()
        if record is not None and terminate_owned(record):
            RECEIPT.unlink(missing_ok=True)
        print("Bridge startup failed. Unlock/Trust the USB device and enable Safari Advanced > Web Inspector; see the private bridge log.")
        return 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("start", "status", "stop"))
    command = parser.parse_args().command
    if not PYTHON.is_file():
        print("Missing prepared Python environment: maintenance/tools/ios-webinspector/venv312.")
        return 1
    if Path(sys.executable).resolve() != PYTHON.resolve():
        # A hidden Windows child has no console; capture its safe status output
        # explicitly so callers using the default Python still see the result.
        completed = subprocess.run([str(PYTHON), str(Path(__file__).resolve()), command],
                                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   text=True, encoding="utf-8", errors="replace")
        sys.stdout.write(completed.stdout)
        if completed.stderr:
            PRIVATE.mkdir(parents=True, exist_ok=True)
            with LOG.open("a", encoding="utf-8") as stream:
                stream.write(completed.stderr)
        return completed.returncode
    try:
        return globals()[command]()
    except ImportError:
        log_failure()
        print("Prepared environment is incomplete; pymobiledevice3 and psutil are required.")
    except Exception:
        log_failure()
        print("Bridge operation failed; check Apple Mobile Device service, USB/trust, and the private bridge log.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
