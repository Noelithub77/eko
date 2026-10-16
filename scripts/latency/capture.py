"""Compare PulseAudio recording fragments without playing or saving audio."""
import argparse
import ctypes as c
import ctypes.util
import json
import math
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--reads", type=int, default=30)
args = parser.parse_args()
if not 10 <= args.reads <= 100:
    parser.error("--reads must be between 10 and 100")

class Spec(c.Structure):
    _fields_ = [("format", c.c_int), ("rate", c.c_uint32), ("channels", c.c_uint8)]

class Attr(c.Structure):
    _fields_ = [(name, c.c_uint32) for name in ("maxlength", "tlength", "prebuf", "minreq", "fragsize")]

def run():
    library = ctypes.util.find_library("pulse-simple")
    if not library:
        raise RuntimeError("libpulse-simple is required (Linux capture backend)")
    lib = c.CDLL(library)
    lib.pa_simple_new.argtypes = [c.c_char_p, c.c_char_p, c.c_int, c.c_char_p, c.c_char_p, c.POINTER(Spec), c.c_void_p, c.POINTER(Attr), c.POINTER(c.c_int)]
    lib.pa_simple_new.restype = c.c_void_p
    lib.pa_simple_read.argtypes = [c.c_void_p, c.c_void_p, c.c_size_t, c.POINTER(c.c_int)]
    lib.pa_simple_read.restype = c.c_int
    lib.pa_simple_get_latency.argtypes = [c.c_void_p, c.POINTER(c.c_int)]
    lib.pa_simple_get_latency.restype = c.c_uint64
    lib.pa_simple_free.argtypes = [c.c_void_p]
    sink = subprocess.run(["pactl", "get-default-sink"], capture_output=True, text=True, check=True, timeout=5).stdout.strip()
    spec, error = Spec(3, 48000, 2), c.c_int()  # S16le, 48 kHz stereo
    buffer = c.create_string_buffer(3840)  # Same 20 ms packet read as the app.
    results = []
    for fragment in (None, 20, 10):
        byte_count = int(48000 * 2 * 2 * (fragment or 20) / 1000)
        attr = Attr(3 * byte_count, 0xffffffff, 0xffffffff, 0xffffffff, byte_count)
        stream = lib.pa_simple_new(None, b"eko-latency-probe", 2, (sink + ".monitor").encode(), b"capture-fragment-comparison", c.byref(spec), None, c.byref(attr) if fragment else None, c.byref(error))
        if not stream:
            raise RuntimeError(f"PulseAudio open failed ({error.value})")
        samples = []
        try:
            for index in range(args.reads + 5):
                if lib.pa_simple_read(stream, buffer, len(buffer), c.byref(error)) < 0:
                    raise RuntimeError(f"PulseAudio read failed ({error.value})")
                latency = lib.pa_simple_get_latency(stream, c.byref(error))
                if latency == 0xffffffffffffffff:
                    raise RuntimeError(f"PulseAudio latency unavailable ({error.value})")
                if index >= 5:
                    samples.append(latency / 1000)
        finally:
            lib.pa_simple_free(stream)
        samples.sort()
        results.append({"fragmentMs": fragment, "samples": len(samples), "averageMs": sum(samples) / len(samples), "p95Ms": samples[math.ceil(.95 * len(samples)) - 1], "maxMs": samples[-1]})
    print(json.dumps({"environment": "local-pulseaudio", "success": True, "measurement": "record pipeline latency, not end-to-end audio delay", "results": results}))

try:
    run()
except Exception as error:
    print(json.dumps({"environment": "local-pulseaudio", "success": False, "error": str(error)}))
    sys.exit(1)
