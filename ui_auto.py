import subprocess, re, time

def adb(*a):
    return subprocess.run(["adb", "shell"] + list(a), capture_output=True, text=True)

def dump():
    adb("uiautomator", "dump", "/sdcard/ui.xml")
    return adb("cat", "/sdcard/ui.xml").stdout

def tap_text(keywords):
    try:
        xml = dump()
    except Exception:
        return False
    for kw in keywords:
        m = re.search(r'text="([^"]*' + kw + r'[^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml)
        if not m:
            m = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*text="([^"]*' + kw + r'[^"]*)"', xml)
        if m:
            x = (int(m.group(2)) + int(m.group(4))) // 2
            y = (int(m.group(3)) + int(m.group(5))) // 2
            subprocess.run(["adb", "shell", "input", "tap", str(x), str(y)], capture_output=True)
            print("tapped:", kw, x, y)
            return True
    return False

for kw in [["同意"], ["允许"], ["我知道了"], ["继续"], ["确认"], ["确定"]]:
    if tap_text(kw):
        time.sleep(2)
    time.sleep(1)
