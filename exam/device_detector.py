import re

def parse_device_info(request, client_hints=None):
    """
    Parses HTTP request headers and client-side hardware/feature telemetry to accurately determine:
    - device_type: 'Laptop / Desktop', 'Mobile', 'Tablet'
    - os_name: 'Android', 'Android (Desktop Mode)', 'iOS (iPhone)', 'iOS (iPhone - Desktop Mode)', 'iOS (iPad)', 'Windows 10 / 11', 'macOS', 'Linux', etc.
    - browser_name: 'Chrome', 'Safari', 'Edge', 'Firefox', 'Samsung Internet', 'Opera', 'Brave', etc.
    - ip_address: Client IP
    - user_agent: Raw user-agent string
    - device_info: Formatted string e.g. '📱 Mobile (Android (Desktop Mode) • Chrome)'
    """
    user_agent = ""
    ip_address = ""
    sec_ch_ua_platform = ""
    sec_ch_ua_mobile = ""

    if request:
        user_agent = request.META.get('HTTP_USER_AGENT', '') or ""
        sec_ch_ua_platform = (request.META.get('HTTP_SEC_CH_UA_PLATFORM', '') or '').replace('"', '').strip()
        sec_ch_ua_mobile = (request.META.get('HTTP_SEC_CH_UA_MOBILE', '') or '').replace('?', '').strip()
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip_address = x_forwarded_for.split(',')[0].strip()
        else:
            ip_address = request.META.get('REMOTE_ADDR', '') or ""

    hints = client_hints if isinstance(client_hints, dict) else {}
    if not user_agent and hints.get('user_agent'):
        user_agent = str(hints.get('user_agent') or '')

    ua = (user_agent or "").lower()

    # --- Client Telemetry Extraction ---
    touch_points = 0
    try:
        touch_points = int(hints.get('touch_points') or 0)
    except (ValueError, TypeError):
        touch_points = 0

    has_touch = bool(hints.get('has_touch')) or (touch_points > 0)
    
    screen_w = 0
    screen_h = 0
    try:
        screen_w = int(hints.get('screen_width') or 0)
        screen_h = int(hints.get('screen_height') or 0)
    except (ValueError, TypeError):
        pass

    min_screen_dim = min(screen_w, screen_h) if (screen_w > 0 and screen_h > 0) else 0
    max_screen_dim = max(screen_w, screen_h) if (screen_w > 0 and screen_h > 0) else 0
    
    pixel_ratio = 1.0
    try:
        pixel_ratio = float(hints.get('pixel_ratio') or 1.0)
    except (ValueError, TypeError):
        pixel_ratio = 1.0

    webgl_vendor = str(hints.get('webgl_vendor') or '').lower()
    webgl_renderer = str(hints.get('webgl_renderer') or '').lower()
    platform_hint = str(hints.get('platform') or '').lower()
    ua_data_platform = str(hints.get('ua_data_platform') or sec_ch_ua_platform or '').lower()
    ua_data_mobile = bool(hints.get('ua_data_mobile')) or (sec_ch_ua_mobile == '1')
    is_client_mobile = bool(hints.get('is_mobile')) or ua_data_mobile

    # Mobile GPU indicators
    mobile_gpus = ['adreno', 'mali', 'immortalis', 'xclipse', 'powervr', 'vivante']
    mobile_vendors = ['qualcomm', 'arm', 'imagination', 'broadcom', 'mediatek', 'unisoc', 'spreadtrum']
    
    is_mobile_gpu = any(gpu in webgl_renderer for gpu in mobile_gpus) or any(v in webgl_vendor for v in mobile_vendors)
    is_apple_gpu = 'apple' in webgl_renderer or 'apple' in webgl_vendor
    
    # Screen heuristics:
    # Most phones have portrait viewport min dimension <= 550px (e.g. 360-430px)
    is_phone_screen = (0 < min_screen_dim <= 550) or (0 < max_screen_dim <= 960 and min_screen_dim <= 600 and pixel_ratio >= 2.0)
    is_tablet_screen = (min_screen_dim > 550 and max_screen_dim <= 1400)

    # --- Unmasking Desktop Mode Spoofing ---
    is_android_desktop_mode = False
    is_ios_desktop_mode = False

    # Check for Android in Desktop Mode (User Agent looks like Linux Desktop)
    if ('android' not in ua) and ('linux' in ua or 'x11' in ua or 'cros' in ua):
        if is_mobile_gpu:
            is_android_desktop_mode = True
        elif ua_data_platform == 'android':
            is_android_desktop_mode = True
        elif has_touch and touch_points >= 1 and (is_phone_screen or pixel_ratio >= 2.0 or 'arm' in platform_hint or 'aarch' in platform_hint):
            is_android_desktop_mode = True

    # Check for iOS (iPhone / iPad) in Desktop Mode (User Agent looks like macOS / Macintosh)
    if ('iphone' not in ua and 'ipad' not in ua and 'ipod' not in ua) and ('macintosh' in ua or 'mac os x' in ua or 'macintel' in platform_hint):
        # Real Apple Mac laptops/desktops NEVER have touchscreens (touch_points is always 0 on macOS)
        if touch_points > 0 or (has_touch and (is_apple_gpu or is_phone_screen or pixel_ratio >= 2.0)):
            is_ios_desktop_mode = True

    # --- 1. Detect OS Name & Device Type ---
    os_name = "Unknown OS"
    device_type = "Laptop / Desktop"

    if 'android' in ua or is_android_desktop_mode:
        match = re.search(r'android\s+([\d\.]+)', ua)
        ver = f" {match.group(1)}" if match else ""
        if is_android_desktop_mode:
            os_name = f"Android{ver} (Desktop Mode)"
        else:
            os_name = f"Android{ver}"
            
        if is_tablet_screen and not is_phone_screen and ("mobile" not in ua):
            device_type = "Tablet"
        else:
            device_type = "Mobile"

    elif 'iphone' in ua or (is_ios_desktop_mode and (is_phone_screen or not is_tablet_screen)):
        if is_ios_desktop_mode:
            os_name = "iOS (iPhone - Desktop Mode)"
        else:
            os_name = "iOS (iPhone)"
        device_type = "Mobile"

    elif 'ipad' in ua or (is_ios_desktop_mode and is_tablet_screen):
        if is_ios_desktop_mode:
            os_name = "iOS (iPad - Desktop Mode)"
        else:
            os_name = "iOS (iPad)"
        device_type = "Tablet"

    elif 'ipod' in ua:
        os_name = "iOS (iPod)"
        device_type = "Mobile"

    elif 'windows nt 10.0' in ua:
        os_name = "Windows 10 / 11"
        device_type = "Laptop / Desktop"
    elif 'windows nt 6.3' in ua:
        os_name = "Windows 8.1"
        device_type = "Laptop / Desktop"
    elif 'windows nt 6.1' in ua:
        os_name = "Windows 7"
        device_type = "Laptop / Desktop"
    elif 'windows' in ua:
        os_name = "Windows"
        device_type = "Laptop / Desktop"

    elif 'macintosh' in ua or 'mac os x' in ua:
        os_name = "macOS"
        device_type = "Laptop / Desktop"

    elif 'cros' in ua:
        os_name = "Chrome OS"
        device_type = "Laptop / Desktop"

    elif 'linux' in ua:
        os_name = "Linux"
        device_type = "Laptop / Desktop"

    else:
        if is_client_mobile or has_touch:
            device_type = "Mobile"

    # --- 2. Detect Browser ---
    browser_name = "Unknown Browser"
    if "edg/" in ua or "edge/" in ua or "edga/" in ua or "edgios/" in ua:
        browser_name = "Microsoft Edge"
    elif "samsungbrowser" in ua:
        browser_name = "Samsung Internet"
    elif "opera" in ua or "opr/" in ua or "opios/" in ua:
        browser_name = "Opera"
    elif "brave" in ua:
        browser_name = "Brave"
    elif "ucbrowser" in ua:
        browser_name = "UC Browser"
    elif "crios" in ua or ("chrome" in ua and "chromium" not in ua):
        browser_name = "Chrome"
    elif "firefox" in ua or "fxios" in ua:
        browser_name = "Firefox"
    elif "safari" in ua and "chrome" not in ua and "crios" not in ua and "android" not in ua:
        browser_name = "Safari"

    # --- 3. Formatted string ---
    icon = "💻 "
    if device_type == "Mobile":
        icon = "📱"
    elif device_type == "Tablet":
        icon = "📟"

    device_info = f"{icon} {device_type} ({os_name} • {browser_name})"

    return {
        "device_type": device_type,
        "os_name": os_name,
        "browser_name": browser_name,
        "ip_address": ip_address[:64] if ip_address else "",
        "user_agent": user_agent,
        "device_info": device_info[:255]
    }
