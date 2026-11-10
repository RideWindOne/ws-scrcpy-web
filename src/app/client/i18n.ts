// Simple i18n system
import { OPERATOR_REFUSAL_ERROR, REMOTE_ADMIN_FORCED_MESSAGE } from '../../common/remoteAdmin';

type Language = 'zh' | 'en';

const translations: Record<string, Record<Language, string>> = {
    'app.title': {
        zh: 'Android Power Tools',
        en: 'Android Power Tools',
    },
    'bookmark_lives_at': {
        zh: '此应用位于 ',
        en: 'this app lives at ',
    },
    'bookmark_it': {
        zh: '，建议加入书签。',
        en: ' — bookmark it.',
    },
    'bookmark_port_note': {
        zh: '，建议加入书签。若端口变化，此提示将再次出现。',
        en: ' — bookmark it. if the port ever changes, this reminder comes back.',
    },
    'bookmark_service_lives_at': {
        zh: 'ws-scrcpy-web 以服务形式运行并随电脑启动。此页面位于 ',
        en: 'ws-scrcpy-web is running as a service and starts with your computer. this page lives at ',
    },
    'bookmark_got_it': {
        zh: '知道了',
        en: 'got it',
    },
    'bookmark_never_again': {
        zh: '不再提醒',
        en: 'never again',
    },
    'bookmark_dismiss': {
        zh: '本次关闭',
        en: 'dismiss for now',
    },
    'bookmark_confirm_title': {
        zh: '关闭书签提示',
        en: 'dismiss bookmark reminder',
    },
    'bookmark_confirm_message': {
        zh: '即使端口变化，也不会再显示此书签提示。',
        en: "you won't see this bookmark helper again, even when the port changes.",
    },
    'https_hostname': {
        zh: '主机名',
        en: 'hostname',
    },
    'updates_channel_stable': {
        zh: '稳定版',
        en: 'stable',
    },
    'updates_channel_beta': {
        zh: '测试版',
        en: 'beta',
    },
    'service_install_user': {
        zh: '当前用户',
        en: 'user',
    },
    'uninstall_confirm_desc': {
        zh: '这将移除应用、其依赖项及已安装的服务。',
        en: 'this removes the app, its dependencies, and any installed service.',
    },
    'uninstall_keep_settings': {
        zh: '保留我的设置与日志',
        en: 'keep my settings & logs',
    },
    'update_installing': {
        zh: '正在安装更新…',
        en: 'installing update…',
    },
    'scanning_mdns': {
        zh: '正在通过 mDNS 扫描…',
        en: 'scanning over mDNS…',
    },
    'large_subnet_advice': {
        zh: '要缩小扫描范围，请取消后编辑子网；否则继续。',
        en: 'To narrow the scan, cancel and edit subnets. Otherwise continue.',
    },
    'large_subnet_continue': {
        zh: '继续扫描',
        en: 'continue scan',
    },
    'welcome_server_on': {
        zh: '服务器运行于 ',
        en: 'server is running on ',
    },
    'welcome_change_port': {
        zh: '可随时在设置中更改端口。',
        en: 'you can change the port anytime in settings.',
    },
    'welcome_run_service': {
        zh: '作为服务运行？',
        en: 'run as a service?',
    },
    'welcome_just_me': {
        zh: '仅当前用户（无需 sudo）',
        en: 'just for me (no sudo)',
    },
    'welcome_all_users': {
        zh: '所有用户（需要 sudo）',
        en: 'all users (requires sudo)',
    },
    'welcome_later_settings': {
        zh: '稍后可到设置中安装/卸载服务。',
        en: 'you can install/uninstall the service later in settings.',
    },
    'welcome_yes_install': {
        zh: '是，安装服务',
        en: 'yes, install service',
    },
    'welcome_no_on_demand': {
        zh: '否，按需运行',
        en: 'no, run on demand',
    },
    'welcome_systemd': {
        zh: '作为 systemd 服务运行？',
        en: 'run as a systemd service?',
    },
    'welcome_desc': {
        zh: '推荐用于始终在线访问（无头服务器、多人使用等场景）。服务器随登录启动并在后台运行。',
        en: 'recommended for always-on access (headless servers, multi-user setups). ' +
            'the server starts at login and runs in the background.',
    },
    'welcome_systemd_desc': {
        zh: '推荐用于始终在线访问。服务器随登录启动（系统级则随开机启动）。',
        en: 'recommended for always-on access. the server starts at login ' + '(or boot, for system scope).',
    },
    'welcome_windows_service': {
        zh: '作为 Windows 服务运行？',
        en: 'run as a windows service?',
    },
    'welcome_windows_desc': {
        zh: '推荐用于始终在线访问（无头服务器、多人使用等场景）。服务器随 Windows 启动并在后台运行。',
        en: 'recommended for always-on access (headless servers, multi-user setups). ' +
            'the server starts with windows and runs in the background.',
    },
    'scan_progress': {
        zh: '正在扫描网络',
        en: 'Scanning network',
    },
    'scan_found': {
        zh: '已发现',
        en: 'found',
    },
    'scan_finishing': {
        zh: '正在完成扫描…',
        en: 'Finishing active scans…',
    },
    'reset_confirm': {
        zh: '确认重置',
        en: 'confirm reset',
    },
    'enable_notifications': {
        zh: '打开通知',
        en: 'Notifications',
    },
    'save_password': {
        zh: '保存密码',
        en: 'Save password',
    },
    'notifications_title': {
        zh: '通知',
        en: 'Notifications',
    },
    'notify_select_apps': {
        zh: '选择应用',
        en: 'Select apps',
    },
    'notify_selected_count': {
        zh: '已选',
        en: 'selected',
    },
    'notify_no_selected': {
        zh: '未选择应用',
        en: 'no apps selected',
    },
    'notify_no_selected_hint': {
        zh: '先在“选择应用”中勾选要查看通知的应用',
        en: 'pick apps in “Select apps” to watch their notifications',
    },
    'notify_loading': {
        zh: '加载中…',
        en: 'Loading…',
    },
    'notify_no_apps': {
        zh: '未获取到应用列表',
        en: 'no apps found',
    },
    'notify_search_apps': {
        zh: '搜索应用',
        en: 'Search apps',
    },
    'notify_no_notifications': {
        zh: '暂无通知',
        en: 'no notifications',
    },
    'notify_reply': {
        zh: '回复',
        en: 'Reply',
    },
    'notify_error': {
        zh: '获取通知失败',
        en: 'failed to load notifications',
    },
    'notify_redacted': {
        zh: '部分系统可能隐藏通知正文，仅显示标题',
        en: 'some systems redact notification bodies; titles only may be shown',
    },
    'shell_close_title': {
        zh: '结束 Shell 会话',
        en: 'End Shell Session',
    },
    'shell_close_message': {
        zh: '结束 Shell 会话会丢失会话中未保存的操作。',
        en: 'ending the shell session loses any active work in the shell.',
    },
    'shell_close_question': {
        zh: '仍然关闭？',
        en: 'close anyway?',
    },
    'close_anyway': {
        zh: '关闭',
        en: 'close',
    },
    'syswide_question': {
        zh: '为这台机器上的所有用户运行 ws-scrcpy-web？',
        en: 'run ws-scrcpy-web for all users on this machine?',
    },
    'syswide_yes_line': {
        zh: '点击“是，所有用户”将以一次管理员授权把应用安装到 /opt。',
        en: 'clicking "yes, all users" installs the app to /opt with one administrator prompt.',
    },
    'syswide_no_line': {
        zh: '点击“否，仅我”将从你当前启动的位置运行应用。',
        en: 'clicking "no, me only" will leave the application running from wherever you launch it from.',
    },
    'syswide_yes': {
        zh: '是，所有用户',
        en: 'yes, all users',
    },
    'syswide_no': {
        zh: '否，仅我',
        en: 'no, me only',
    },
    'dep_check_updates': {
        zh: '检查更新',
        en: 'check for updates',
    },
    'admin_local_readonly_title': {
        zh: '远程客户端的管理操作已禁用。',
        en: 'Admin actions are disabled for remote clients.',
    },
    'admin_local_readonly_body': {
        zh: '此服务器未配置登录。要管理它，请在运行服务器的机器上打开此页面——或设置 WS_SCRCPY_ALLOW_REMOTE_ADMIN=1。',
        en: 'This server has no sign-in configured. To manage it, open this page on the machine ' +
            'running the server — or set WS_SCRCPY_ALLOW_REMOTE_ADMIN=1.',
    },
    'admin_limited_title': {
        zh: '管理操作仅限本机。',
        en: 'Admin actions are limited to this machine.',
    },
    'remote_admin_forced_message': {
        zh: '已由服务器环境变量 WS_SCRCPY_ALLOW_REMOTE_ADMIN=1 强制开启；移除该变量即可关闭。',
        en: 'forced on by WS_SCRCPY_ALLOW_REMOTE_ADMIN=1 on the server; remove the variable to turn it off.',
    },
    'admin_limited_body': {
        zh: '未配置登录，因此网络上的任何人都可访问此服务器。管理操作——用户、配置、关机——因此仅限于本机。',
        en: 'No sign-in is configured, so anyone on your network can reach this server. Admin ' +
            'actions — users, configuration, shutdown — are restricted to this machine as a result.',
    },
    'admin_setup_signin': {
        zh: '设置登录',
        en: 'Set up sign-in',
    },
    'admin_allow_remote': {
        zh: '允许免登录远程管理',
        en: 'Allow remote admin without sign-in',
    },
    'remote_admin_allow_title': {
        zh: '允许在未登录的情况下远程管理？',
        en: 'Allow remote admin without sign-in?',
    },
    'remote_admin_allow_warn': {
        zh: '⚠ 这将使你网络中的任何人都成为管理员。',
        en: '⚠ This makes anyone on your network an administrator.',
    },
    'remote_admin_allow_body': {
        zh: '未配置登录时，允许远程管理意味着任何能访问此服务器的设备都可以创建和删除用户、修改配置以及关闭服务器。一切都不受密码保护。',
        en: 'With no sign-in configured, allowing remote admin means any device that can reach this ' +
            'server can create and delete users, change configuration, and shut the server down. ' +
            'Nothing is protected by a password.',
    },
    'addsubnet_see': {
        zh: '参见 ',
        en: 'See the ',
    },
    'addsubnet_cheatsheet': {
        zh: '子网速查表',
        en: 'subnet cheat sheet',
    },
    'users_reset_password': {
        zh: '重置密码',
        en: 'reset password',
    },
    'users_add_user': {
        zh: '添加用户',
        en: 'Add user',
    },
    'users_secure_admin': {
        zh: '保护管理员账户',
        en: 'Secure the admin account',
    },
    'users_admin_username': {
        zh: '管理员用户名',
        en: 'Admin username',
    },
    'users_admin_password': {
        zh: '管理员密码',
        en: 'Admin password',
    },
    'users_new_user': {
        zh: '新用户',
        en: 'New user',
    },
    'users_require_both': {
        zh: '用户名和密码均为必填项。',
        en: 'Username and password are required.',
    },
    'users_require_admin_both': {
        zh: '保护账户需要填写管理员用户名和密码。',
        en: 'Admin username and password are required to secure the account.',
    },
    'users_login_required_reload': {
        zh: '现已要求登录。正在重新加载…',
        en: 'Login is now required. Reloading…',
    },
    'users_lockdown_failed': {
        zh: '锁定失败：HTTP ',
        en: 'Lockdown failed: HTTP ',
    },
    'remote_admin_warn_scope': {
        zh: '仅在你完全掌控的网络中执行此操作。',
        en: 'Only do this on a network you fully control.',
    },
    'remote_admin_setup_signin': {
        zh: '改为设置登录',
        en: 'Set up sign-in instead',
    },
    'remote_admin_accept': {
        zh: '我了解——允许远程管理',
        en: 'I understand — allow remote admin',
    },
    'debug_url': {
        zh: 'URL: ',
        en: 'URL: ',
    },
    'cont_update_current_version': {
        zh: '当前版本',
        en: 'Current version',
    },
    'cont_update_github_repo': {
        zh: 'GitHub 仓库',
        en: 'GitHub repo',
    },
    'cont_update_repo_placeholder': {
        zh: '例如 wind/ws-scrcpy-web',
        en: 'e.g. wind/ws-scrcpy-web',
    },
    'cont_update_save_repo': {
        zh: '保存',
        en: 'Save',
    },
    'cont_update_check': {
        zh: '检查更新',
        en: 'Check for updates',
    },
    'cont_update_checking': {
        zh: '正在检查…',
        en: 'Checking…',
    },
    'cont_update_up_to_date': {
        zh: '已是最新版本',
        en: 'up to date',
    },
    'cont_update_found': {
        zh: '发现新版本',
        en: 'update found',
    },
    'cont_update_published': {
        zh: '发布于',
        en: 'Published',
    },
    'cont_update_apply': {
        zh: '下载并更新',
        en: 'Download & update',
    },
    'cont_update_downloading': {
        zh: '正在下载…',
        en: 'Downloading…',
    },
    'cont_update_uploading': {
        zh: '正在上传…',
        en: 'Uploading…',
    },
    'cont_update_applying': {
        zh: '正在应用更新——容器即将重启，请稍后刷新页面。',
        en: 'Applying update — the container restarts now. Refresh in a moment.',
    },
    'cont_update_bad_response': {
        zh: '服务器返回异常（若已提交成功，刷新页面后版本号会变化）：',
        en: 'Unexpected server response (refresh to see if it applied): ',
    },
    'cont_update_upload_title': {
        zh: '手动上传更新',
        en: 'Upload update manually',
    },
    'cont_update_choose_file': {
        zh: '选择 dist 包',
        en: 'Choose dist package',
    },
    'cont_update_upload': {
        zh: '上传并更新',
        en: 'Upload & update',
    },
    'cont_update_upload_desc': {
        zh: '上传 dist-*.tar.gz 包：校验通过后容器自动重启并替换 /app/dist。只更新 dist，不影响 seed、依赖与启动脚本。',
        en: 'Upload a dist-*.tar.gz package: it is validated, then the container restarts and replaces /app/dist. Only dist is replaced — never seed, dependencies or start.sh.',
    },
    'cont_update_repo_saved': {
        zh: '已保存',
        en: 'Saved',
    },
    'cont_update_no_release': {
        zh: '该仓库没有发布版本',
        en: 'this repo has no releases',
    },
    'cont_update_no_asset': {
        zh: '该版本没有 dist 安装包',
        en: 'this release has no dist package',
    },
    'update_applying': {
        zh: '正在更新——应用新版本…',
        en: 'updating — applying the new version…',
    },
    'update_reconnecting': {
        zh: '正在更新——重启并重新连接…',
        en: 'updating — restarting and reconnecting…',
    },
    'update_applied': {
        zh: '更新已完成。如果此页面没有自动返回，请重新打开 ',
        en: 'update applied. if this page doesn\'t return on its own, reopen ',
    },
    'update_app_url': {
        zh: '应用地址',
        en: 'the app url',
    },
    'update_checking': {
        zh: '正在检查更新…',
        en: 'checking for updates…',
    },
    'update_downloading': {
        zh: '正在下载更新',
        en: 'downloading update',
    },
    'update_check_again': {
        zh: '再次检查更新',
        en: 'check for updates again',
    },
    'update_restarting': {
        zh: '服务器正在重启以应用更新',
        en: 'server is restarting to apply the update',
    },
    'scan_edit_subnet': {
        zh: '编辑子网',
        en: 'edit subnet',
    },
    'users_new_password': {
        zh: '新密码',
        en: 'new password',
    },
    'users_show_hide_pw': {
        zh: '显示/隐藏密码',
        en: 'Show/hide password',
    },
    'users_show_hide_admin_pw': {
        zh: '显示/隐藏管理员密码',
        en: 'Show/hide admin password',
    },
    'files_icon_size_pref': {
        zh: '图标大小偏好',
        en: 'icon size preference',
    },
    'device_edit_name': {
        zh: '编辑设备名称',
        en: 'Edit device name',
    },
    'device_name_placeholder': {
        zh: '为此设备命名…',
        en: 'Name this device...',
    },
    'files_icon_size': {
        zh: '图标大小',
        en: 'icon size',
    },
    'files_drop_here': {
        zh: '将文件拖到这里',
        en: 'drop files here',
    },
    'files_delete_failed': {
        zh: '删除请求失败',
        en: 'delete request failed',
    },
    'clipboard_ready': {
        zh: '设备剪贴板已就绪——',
        en: 'Device clipboard ready —',
    },
    'clipboard_click_copy': {
        zh: '点击复制',
        en: 'click to copy',
    },
    'stream_device_locked': {
        zh: '设备已锁定——解锁后即可查看屏幕',
        en: 'device is locked — unlock it to see the screen',
    },
    'shell_resize_warning': {
        zh: '会话开始后调整浏览器窗口大小可能导致显示异常',
        en: 'resizing the browser window after starting a session may cause display issues',
    },
    'settings': {
        zh: '设置',
        en: 'Settings',
    },
    'connect': {
        zh: '连接',
        en: 'Connect',
    },
    'devices': {
        zh: '设备',
        en: 'Devices',
    },
    'scrcpy_sessions': {
        zh: 'Scrcpy 会话',
        en: 'Scrcpy Sessions',
    },
    'edit_session': {
        zh: '编辑会话',
        en: 'Edit Session',
    },
    'save': {
        zh: '保存',
        en: 'Save',
    },
    'save_btn': {
        zh: '保存',
        en: 'save',
    },
    'discard_btn': {
        zh: '丢弃',
        en: 'discard',
    },
    'cancel': {
        zh: '取消',
        en: 'Cancel',
    },
    'cancel_btn': {
        zh: '取消',
        en: 'cancel',
    },
    'advanced': {
        zh: '高级',
        en: 'Advanced',
    },
    'turn_screen_off': {
        zh: '连接后关闭屏幕',
        en: 'Turn screen off',
    },
    'lock_on_disconnect': {
        zh: '断开后锁定设备',
        en: 'Lock on disconnect',
    },
    'stay_awake': {
        zh: '保持设备唤醒（被控设备不熄屏）',
        en: 'Stay awake (controlled device)',
    },
    'keep_screen_on': {
        zh: '保持本机屏幕常亮（浏览器）',
        en: 'Keep this screen on (browser)',
    },
    'stay_awake_hint': {
        zh: '让被控手机/平板在连接期间保持亮屏；需重新连接后生效',
        en: 'Keeps the controlled device awake while connected. Takes effect on the next connection.',
    },
    'keep_screen_on_hint': {
        zh: '用浏览器的屏幕唤醒锁保持本机亮屏，切到后台会自动失效、回到前台自动恢复；浏览器无法获得真正的后台运行权限，长时间后台请加入主屏并在系统里允许后台活动',
        en: 'Uses the browser Screen Wake Lock to keep this display on. It is dropped when the page goes to the background and re-acquired on return. Browsers cannot get real background running: add the page to the home screen and allow background activity in the system for long sessions.',
    },
    'cleanup_on_disconnect': {
        zh: '断开后清理恢复',
        en: 'Cleanup on disconnect',
    },
    'quick_scan': {
        zh: '快速扫描',
        en: 'quick scan',
    },
    'scan_network': {
        zh: '扫描网络',
        en: 'scan network',
    },
    'manually_add': {
        zh: '手动添加',
        en: 'manually add',
    },
    'scan_qr_code': {
        zh: '扫描二维码',
        en: 'scan QR code',
    },
    'pairing_code': {
        zh: '配对码',
        en: 'pairing code',
    },
    'available_devices': {
        zh: '可用网络设备',
        en: 'Available Network Devices',
    },
    'discovery_hint': {
        zh: '点击快速扫描查找网络中的现代安卓设备，或扫描网络探测整个子网。请确保要连接的设备已开启无线调试。',
        en: 'Click quick scan for modern Android devices on your network, or scan network to probe a full subnet. Make sure wireless debugging is enabled on the devices you wish to connect with.',
    },
    'display': {
        zh: '显示器',
        en: 'display:',
    },
    'video_codec': {
        zh: '视频编码',
        en: 'video codec:',
    },
    'encoder': {
        zh: '编码器',
        en: 'encoder:',
    },
    'audio_codec': {
        zh: '音频编码',
        en: 'audio codec:',
    },
    'audio_source': {
        zh: '音频源',
        en: 'audio source:',
    },
    'enable_audio': {
        zh: '启用音频',
        en: 'enable audio:',
    },
    'fit_to_screen': {
        zh: '适配屏幕',
        en: 'fit to screen',
    },
    'reset': {
        zh: '重置',
        en: 'reset',
    },
    'load': {
        zh: '加载',
        en: 'load',
    },
    'other_options': {
        zh: '其他选项',
        en: 'Other options',
    },
    'clipboard_sync': {
        zh: '剪贴板同步',
        en: 'Clipboard sync',
    },
    'saved': {
        zh: '已保存',
        en: 'saved',
    },
    'audio_decoder': {
        zh: '音频解码器',
        en: 'Audio decoder',
    },
    'volume_scale': {
        zh: '音量缩放',
        en: 'Volume scale',
    },
    'ignore_codec_constraints': {
        zh: '忽略视频编码器约束',
        en: 'Ignore video encoder constraints',
    },
    'virtual_display': {
        zh: '虚拟显示',
        en: 'Virtual display',
    },
    'start_new_display': {
        zh: '启动新的显示',
        en: 'Start new display',
    },
    'start_app': {
        zh: '启动 App',
        en: 'Start App',
    },
    'remote_package_name': {
        zh: '远端应用包名',
        en: 'Remote package name',
    },
    'max_fps': {
        zh: '最大帧率',
        en: 'max fps',
    },
    'bitrate': {
        zh: '比特率',
        en: 'bitrate',
    },
    'i_frame_interval': {
        zh: 'I帧间隔',
        en: 'i-frame interval',
    },
    'max_width': {
        zh: '最大宽度',
        en: 'max width',
    },
    'max_height': {
        zh: '最大高度',
        en: 'max height',
    },
    'codec_options': {
        zh: '编解码选项',
        en: 'codec options',
    },
    'connected_devices': {
        zh: '已连接设备',
        en: 'Connected Devices',
    },
    'device_name': {
        zh: '设备名称',
        en: 'Device Name',
    },
    'model': {
        zh: '型号',
        en: 'Model',
    },
    'device_id': {
        zh: '设备 ID',
        en: 'Device ID',
    },
    'unlock_title': {
        zh: '输入密码',
        en: 'Enter password',
    },
    'unlock_set_pin': {
        zh: '数字密码',
        en: 'PIN code',
    },
    'unlock_set_pattern': {
        zh: '图案密码',
        en: 'Pattern',
    },
    'unlock_configure_section': {
        zh: '锁屏密码（用于未 Root 手机自动解锁）',
        en: 'Lock-screen password (auto-unlock on non-rooted devices)',
    },
    'unlock_pin_label': {
        zh: '锁屏数字密码',
        en: 'Lock-screen PIN',
    },
    'unlock_pattern_label': {
        zh: '绘制解锁图案',
        en: 'Draw unlock pattern',
    },
    'unlock_pattern_hint': {
        zh: '拖动连接圆点绘制图案，至少 4 个点',
        en: 'Drag across dots to draw the pattern, at least 4 points',
    },
    'unlock_save': {
        zh: '保存',
        en: 'Save',
    },
    'unlock_now': {
        zh: '解锁',
        en: 'Unlock',
    },
    'unlock_saved_ok': {
        zh: '已保存',
        en: 'Saved',
    },
    'unlock_waking': {
        zh: '正在唤醒屏幕…',
        en: 'Waking screen…',
    },
    'unlock_detecting': {
        zh: '正在检测密码框…',
        en: 'Detecting password field…',
    },
    'unlock_detect_error': {
        zh: '密码框探测失败',
        en: 'password field detection failed',
    },
    'unlock_injecting': {
        zh: '正在输入密码…',
        en: 'Entering password…',
    },
    'unlock_send_ok': {
        zh: '密码已发送',
        en: 'Password sent',
    },
    'unlock_send_fail': {
        zh: '发送失败',
        en: 'Failed to send',
    },
    'unlock_need_pin': {
        zh: '请输入数字密码',
        en: 'Enter the PIN first',
    },
    'unlock_clear': {
        zh: '清除密码',
        en: 'Clear passwords',
    },
    'unlock_clear_none': {
        zh: '清除密码',
        en: 'Clear passwords',
    },
    'unlock_redraw': {
        zh: '绘制密码',
        en: 'Draw pattern',
    },
    'unlock_pattern_apply': {
        zh: '立即解锁',
        en: 'Unlock now',
    },
    'unlock_pattern_clear': {
        zh: '清空重绘',
        en: 'Clear',
    },
    'unlock_pattern_selected': {
        zh: '已选 ',
        en: 'Selected: ',
    },
    'unlock_use_cache': {
        zh: '使用位置缓存',
        en: 'Use position cache',
    },
    'unlock_using_saved': {
        zh: '已记住图案，解锁时自动输入（不在屏幕上显示）',
        en: 'Saved pattern will be used on unlock (not shown on screen)',
    },
    'unlock_clear_cache': {
        zh: '清空位置缓存',
        en: 'Clear position cache',
    },
    'unlock_cache_cleared': {
        zh: '已清空',
        en: 'Cleared',
    },
    'unlock_need_pattern': {
        zh: '请先绘制图案',
        en: 'Draw a pattern first',
    },
    'unlock_pin_required': {
        zh: '屏幕显示的是数字密码框（可能图案尝试次数过多）——请切换到数字密码模式直接输入',
        en: 'The screen is asking for a numeric PIN (pattern attempts may be exhausted) — switch to PIN mode and type it in',
    },
    'shell': {
        zh: 'Shell',
        en: 'shell',
    },
    'list_files': {
        zh: '文件列表',
        en: 'list files',
    },
    'config_stream': {
        zh: '更多设置',
        en: 'more settings',
    },
    'disconnect': {
        zh: '断开连接',
        en: 'disconnect',
    },
    'turn_off': {
        zh: '关闭屏幕',
        en: 'turn off',
    },
    'turn_on': {
        zh: '打开屏幕',
        en: 'turn on',
    },
    'checking': {
        zh: '检查中...',
        en: 'checking...',
    },
    'pair_new_device': {
        zh: '配对新设备',
        en: 'Pair a new device',
    },
    'ready': {
        zh: '就绪',
        en: 'ready',
    },
    'scan_network_title': {
        zh: '扫描网络中的设备',
        en: 'Scan Network for Devices',
    },
    'scan_network_explain': {
        zh: '扫描本地网络中开启无线调试的安卓设备。它会检查 mDNS 广播（现代设备），并探测所选子网中每个主机的 5555 端口（旧设备）。',
        en: 'This scans your local network for Android devices with wireless debugging enabled. It checks mDNS broadcasts (modern devices) and probes port 5555 on each host in the selected subnets (older devices).',
    },
    'subnets_to_scan': {
        zh: '要扫描的子网：',
        en: 'Subnets to scan:',
    },
    'add_subnet': {
        zh: '添加子网',
        en: 'add subnet',
    },
    'start_scan': {
        zh: '开始扫描',
        en: 'start scan',
    },
    'rotate_landscape': {
        zh: '横屏观看',
        en: 'Landscape view',
    },
    'rotate_landscape_hint': {
        zh: '全屏并锁定为横屏，无需打开手机自动旋转；再点一次恢复',
        en: 'Fullscreen and lock to landscape — no phone auto-rotate needed. Tap again to restore.',
    },
    'rotate_landscape_unsupported': {
        zh: '该浏览器不支持锁定方向，请打开手机自动旋转',
        en: 'This browser cannot lock orientation — enable auto-rotate on the phone',
    },
    'edge_zone_title': {
        zh: '边缘唤出条设置',
        en: 'Edge strip settings',
    },
    'edge_zone_hint': {
        zh: '全屏时点这条半透明竖条可唤出工具栏，拖滑杆立即生效',
        en: 'In fullscreen, tap this translucent bar to reveal the toolbox. Sliders apply at once.',
    },
    'edge_zone_side': {
        zh: '位置',
        en: 'Side',
    },
    'edge_zone_left': {
        zh: '左侧',
        en: 'Left',
    },
    'edge_zone_right': {
        zh: '右侧',
        en: 'Right',
    },
    'edge_zone_length': {
        zh: '长度',
        en: 'Length',
    },
    'edge_zone_width': {
        zh: '宽度',
        en: 'Thickness',
    },
    'edge_zone_button': {
        zh: '边缘唤出条',
        en: 'Edge strip',
    },
    'no_devices': {
        zh: '没有已连接的设备。',
        en: 'No devices connected.',
    },
    'optional_name': {
        zh: '可选名称',
        en: 'optional name',
    },
    'scan_network_warning': {
        zh: '扫描会向所选子网中的每个主机发送连接尝试。在受管理或企业网络中，这可能会触发入侵检测警报。请仅扫描您拥有或管理的网络。',
        en: 'Scanning sends connection attempts to every host on the selected subnet(s). On managed or corporate networks this may trigger intrusion-detection alerts. Only scan networks you own or administer.',
    },
    'container_note': {
        zh: 'ws-scrcpy-web 运行在容器中，因此无法识别您的网络子网。请在下方添加（例如 192.168.1.0/24）：5555 端口探测会通过 docker 到达您的局域网。通过 mDNS 发现设备需要容器运行在主机网络模式下（network_mode: host）。',
        en: 'ws-scrcpy-web is running in a container, so it can\'t see your network\'s subnet. Add it below (for example 192.168.1.0/24): the port-5555 probe reaches your LAN through docker. Finding devices over mDNS needs the container on the host\'s network (network_mode: host).',
    },
    'add_subnet_hint': {
        zh: '请在下方添加至少一个子网进行扫描。',
        en: 'Add at least one subnet below to scan.',
    },
    'no_mdns_devices': {
        zh: '没有发现 mDNS 广播的设备。请尝试扫描网络进行完整子网探测。',
        en: 'No devices advertising over mDNS. Try scan network for a full subnet probe.',
    },
    'unnamed_device': {
        zh: '未命名设备',
        en: 'Unnamed Device',
    },
    'new_to_cidr': {
        zh: '不熟悉 CIDR？请查看',
        en: 'New to CIDR? See the',
    },
    'subnet_cheat_sheet': {
        zh: '子网速查表',
        en: 'subnet cheat sheet',
    },
    'connecting': {
        zh: '连接中...',
        en: 'connecting',
    },
    'connected_to': {
        zh: '已连接到',
        en: 'Connected to',
    },
    'add_subnet_to_scan': {
        zh: '添加要扫描的子网',
        en: 'Add Subnet to Scan',
    },
    'edit_subnet': {
        zh: '编辑子网',
        en: 'Edit Subnet',
    },
    'add': {
        zh: '添加',
        en: 'add',
    },
    'accepted_formats': {
        zh: '支持的格式：CIDR (192.168.2.0/24)、单个 IP (192.168.2.5) 或范围 (192.168.2.10-50)。',
        en: 'Accepted formats: CIDR (192.168.2.0/24), single IP (192.168.2.5), or range (192.168.2.10-50).',
    },
    'android': {
        zh: 'Android 版本',
        en: 'Android',
    },
    'sdk': {
        zh: 'SDK 版本',
        en: 'SDK',
    },
    'close': {
        zh: '关闭',
        en: 'close',
    },
    // ── Settings panel (Server / Service / Updates / Users / Local HTTPS / Embedding / Dependencies) ──
    'reset_all_settings': {
        zh: '重置所有设置',
        en: 'reset all my settings',
    },
    'debug_overlay': {
        zh: '调试浮层',
        en: 'debug overlay',
    },
    'install': {
        zh: '安装',
        en: 'install',
    },
    'installing': {
        zh: '安装中…',
        en: 'installing…',
    },
    'uninstall': {
        zh: '卸载…',
        en: 'uninstall…',
    },
    'uninstalling': {
        zh: '卸载中…',
        en: 'uninstalling…',
    },
    'app_stopped': {
        zh: '应用已停止——可以关闭此标签页。',
        en: 'app stopped — you can close this tab.',
    },
    'stopping': {
        zh: '停止中…',
        en: 'stopping…',
    },
    'restarting': {
        zh: '重启中…',
        en: 'restarting…',
    },
    'restart_server': {
        zh: '重启服务器',
        en: 'restart server',
    },
    'current_password': {
        zh: '当前密码',
        en: 'current password',
    },
    'new_password': {
        zh: '新密码',
        en: 'new password',
    },
    'show_hide': {
        zh: '显示/隐藏',
        en: 'show/hide',
    },
    'enter_pwd_hint': {
        zh: '请输入当前密码和新密码',
        en: 'enter your current and new password',
    },
    'change_password': {
        zh: '修改密码',
        en: 'change password',
    },
    'password': {
        zh: '密码',
        en: 'password',
    },
    'log_out': {
        zh: '退出登录',
        en: 'log out',
    },
    'session': {
        zh: '会话',
        en: 'session',
    },
    'http_port': {
        zh: 'HTTP 端口',
        en: 'http port',
    },
    'https_port': {
        zh: 'HTTPS 端口',
        en: 'https port',
    },
    'restart_the_server': {
        zh: '重启服务器',
        en: 'restart the server',
    },
    'install_for_all_users': {
        zh: '为所有用户安装',
        en: 'install for all users',
    },
    'stop_server_exit': {
        zh: '停止服务器并退出',
        en: 'stop server & exit',
    },
    'stop_server_close_app': {
        zh: '停止服务器并关闭应用',
        en: 'stop the server and close the app',
    },
    'uninstall_app': {
        zh: '卸载 ws-scrcpy-web',
        en: 'uninstall ws-scrcpy-web',
    },
    'loading_status': {
        zh: '正在加载安装/卸载状态…',
        en: 'loading install/uninstall status…',
    },
    'retry': {
        zh: '重试',
        en: 'retry',
    },
    'service_scope': {
        zh: '服务作用域',
        en: 'service scope',
    },
    'not_installed_install': {
        zh: '未安装——安装？',
        en: 'not installed — install?',
    },
    'installs_uninstalls_service': {
        zh: '安装/卸载服务器服务',
        en: 'installs/uninstalls server service',
    },
    'switching_system_service': {
        zh: '正在切换到系统服务…',
        en: 'switching to the system service…',
    },
    'reconnecting': {
        zh: '重新连接中…',
        en: 'reconnecting…',
    },
    'loading': {
        zh: '加载中…',
        en: 'loading…',
    },
    'auto_download_updates': {
        zh: '自动下载更新',
        en: 'Automatic updates',
    },
    'check_interval': {
        zh: '检查间隔（分钟）',
        en: 'Check interval (minutes)',
    },
    'update_channel': {
        zh: '更新通道',
        en: 'Update channel',
    },
    'github_owner': {
        zh: 'GitHub 所有者',
        en: 'GitHub owner',
    },
    'check_updates_now': {
        zh: '立即检查更新',
        en: 'check for updates now',
    },
    'applying': {
        zh: '正在应用…',
        en: 'applying…',
    },
    'checking_updates': {
        zh: '正在检查更新…',
        en: 'checking for updates…',
    },
    'manage_users': {
        zh: '管理用户',
        en: 'manage users',
    },
    'user_accounts': {
        zh: '用户账户',
        en: 'user accounts',
    },
    'disable_login': {
        zh: '禁用登录（返回开放模式）',
        en: 'disable login (return to open mode)',
    },
    'login': {
        zh: '登录',
        en: 'login',
    },
    'enable_login': {
        zh: '启用登录',
        en: 'enable login',
    },
    'remote_admin_no_signin': {
        zh: '免登录远程管理',
        en: 'remote admin without sign-in',
    },
    'cert_subject': {
        zh: '证书主题',
        en: 'certificate subject',
    },
    'generate': {
        zh: '生成',
        en: 'generate',
    },
    'generating': {
        zh: '生成中…',
        en: 'generating…',
    },
    'revoke': {
        zh: '吊销',
        en: 'revoke',
    },
    'certificate': {
        zh: '证书',
        en: 'certificate',
    },
    'download_ca_cert': {
        zh: '下载 CA 证书',
        en: 'download ca certificate',
    },
    'root_ca': {
        zh: '根 CA',
        en: 'root ca',
    },
    'ok': {
        zh: '确定',
        en: 'ok',
    },
    'plain_http_exposure': {
        zh: '明文 HTTP 暴露',
        en: 'plain http exposure',
    },
    'no_origins_embed': {
        zh: '其他来源不得嵌入此应用。',
        en: 'No other origins may embed this app.',
    },
    'remove': {
        zh: '移除',
        en: 'remove',
    },
    'pending_saved': {
        zh: '待处理——点击保存后生效',
        en: 'pending — saved when you click save',
    },
    'ip_or_hostname': {
        zh: 'IP 地址或主机名',
        en: 'ip address or hostname',
    },
    'add_embedder': {
        zh: '添加嵌入来源',
        en: 'add an embedder',
    },
    'loading_dependencies': {
        zh: '正在加载依赖…',
        en: 'loading dependencies…',
    },
    // ── Settings card titles ──
    'card_settings': {
        zh: '设置',
        en: 'Settings',
    },
    'card_ports': {
        zh: '端口',
        en: 'Ports',
    },
    'card_application': {
        zh: '应用',
        en: 'Application',
    },
    'card_certificate': {
        zh: '证书',
        en: 'Certificate',
    },
    'card_trust': {
        zh: '信任',
        en: 'Trust',
    },
    'card_exposure': {
        zh: '暴露',
        en: 'Exposure',
    },
    // ── Settings tab / section titles ──
    'tab_server': {
        zh: '服务器',
        en: 'Server',
    },
    'tab_service': {
        zh: '服务',
        en: 'Service',
    },
    'tab_updates': {
        zh: '更新',
        en: 'Updates',
    },
    'tab_users': {
        zh: '用户',
        en: 'Users',
    },
    'tab_embedding': {
        zh: '嵌入',
        en: 'Embedding',
    },
    'tab_local_https': {
        zh: '本地 HTTPS',
        en: 'Local HTTPS',
    },
    'tab_dependencies': {
        zh: '依赖',
        en: 'Dependencies',
    },
    'tab_dependencies_link': {
        zh: '依赖',
        en: 'dependencies tab',
    },
    'open_settings_aria': {
        zh: '打开设置',
        en: 'Open settings',
    },
    'review_changes': {
        zh: '查看更改',
        en: 'Review changes',
    },
    'unsaved_changes': {
        zh: '未保存的更改',
        en: 'Unsaved changes',
    },
    'unsaved_changes_msg': {
        zh: '您有尚未保存的更改。',
        en: 'you have changes that have not been saved yet.',
    },
    'discard': {
        zh: '放弃',
        en: 'discard',
    },
    // ── Settings card prose / notes / alerts (round 2) ──
    'ports_must_differ': {
        zh: 'HTTP 和 HTTPS 端口必须不同。',
        en: 'the http and https ports must differ.',
    },
    'uninstall_started_note': {
        zh: '卸载已开始——ws-scrcpy-web 正在关闭并移除自身。您可以关闭此标签页。',
        en: 'uninstall started — ws-scrcpy-web is shutting down and removing itself. you can close this tab.',
    },
    'managed_by_service_note': {
        zh: '由系统服务管理——请通过服务管理器停止，或卸载该服务。',
        en: 'managed by the system service — stop it via your service manager, or uninstall the service.',
    },
    'already_installed_all_users': {
        zh: '已为所有用户安装（/opt）',
        en: 'already installed for all users (/opt)',
    },
    'install_failed_logs': {
        zh: '安装失败——请查看服务器日志后重试。',
        en: 'install failed — see the server logs and try again.',
    },
    'install_failed_reach': {
        zh: '安装失败——无法连接服务器。',
        en: 'install failed — could not reach the server.',
    },
    'uninstall_failed_logs': {
        zh: '卸载失败——请查看服务器日志后重试。',
        en: 'uninstall failed — see the server logs and try again.',
    },
    'uninstall_failed_reach': {
        zh: '卸载失败——无法连接服务器。',
        en: 'uninstall failed — could not reach the server.',
    },
    'shutdown_warn': {
        zh: '应用将关闭，此浏览器标签页将尝试关闭。',
        en: 'the app will shut down and this browser tab will try to close.',
    },
    'end_connections_q': {
        zh: '任何活动设备连接都将结束。继续？',
        en: 'any active device connections will end. continue?',
    },
    'restarting_note': {
        zh: '正在重启服务器…页面恢复后会自动刷新。',
        en: 'restarting the server… this page will reload once it is back.',
    },
    'unsaved_lost_warn': {
        zh: '您未保存的设置更改将丢失。',
        en: 'your unsaved settings changes will be lost.',
    },
    'restart_warn': {
        zh: '服务器将重启，页面恢复后会自动刷新。',
        en: 'the server will restart and this page will reload once it is back.',
    },
    'password_changed': {
        zh: '密码已更改',
        en: 'password changed',
    },
    'current_password_incorrect': {
        zh: '当前密码不正确',
        en: 'current password incorrect',
    },
    'could_not_reach': {
        zh: '无法连接服务器',
        en: 'could not reach server',
    },
    'logout_failed_reload': {
        zh: '退出登录请求失败——无论如何将刷新页面。',
        en: 'logout request failed — reloading anyway.',
    },
    'port_range_1024': {
        zh: '端口必须在 1024 到 65535 之间',
        en: 'port must be between 1024 and 65535',
    },
    'port_range_1': {
        zh: '端口必须在 1 到 65535 之间',
        en: 'port must be between 1 and 65535',
    },
    'service_removed_note': {
        zh: '服务已移除。系统服务已停止。请手动重新启动应用以使用本地模式。',
        en: 'service removed. the system service has been stopped. relaunch the app manually to use local mode.',
    },
    'service_install_requires_systemwide': {
        zh: '安装系统服务需要先为所有用户进行系统级安装。',
        en: 'system service install requires installing system-wide for all users first.',
    },
    'service_windows_only': {
        zh: '服务模式目前仅支持 Windows。Linux 支持将在 SP3 中提供。',
        en: 'service mode is currently windows-only. linux support arrives later in SP3.',
    },
    'system_req_sudo': {
        zh: '系统（需 sudo）',
        en: 'system (req. sudo)',
    },
    'install_service': {
        zh: '安装服务',
        en: 'install service',
    },
    'uninstall_service': {
        zh: '卸载服务',
        en: 'uninstall service',
    },
    'removing_system_service': {
        zh: '正在移除系统服务…',
        en: 'removing the system service…',
    },
    'service_still_running_note': {
        zh: '系统服务仍在运行——卸载可能未完成。请查看服务日志并尝试重新加载。',
        en: 'the system service is still running — uninstall may not have completed. check the service logs and try reloading.',
    },
    'service_uninstalled_no_instance': {
        zh: '服务已卸载，但未检测到新实例。请尝试重新加载。',
        en: 'service uninstalled but fresh instance not detected. try reloading.',
    },
    'checking_updates_ellipsis': {
        zh: '正在检查更新…',
        en: 'checking for updates…',
    },
    'unknown_error': {
        zh: '未知错误',
        en: 'unknown error',
    },
    'apply_update': {
        zh: '应用更新',
        en: 'apply update',
    },
    'github_owner_empty': {
        zh: 'GitHub 所有者不能为空',
        en: 'github owner cannot be empty',
    },
    'installing_update': {
        zh: '正在安装更新…',
        en: 'installing update…',
    },
    'server_restarting_update': {
        zh: '服务器正在重启以应用更新——页面将自动刷新…',
        en: 'server restarting to apply update — page will reload…',
    },
    'remote_admin_label': {
        zh: '免登录远程管理',
        en: 'Remote admin without sign-in',
    },
    'remote_admin_on_note': {
        zh: '任何能访问此服务器的设备都可以管理它。请设置登录，或取消勾选此项以关闭。',
        en: 'any device that can reach this server can administer it. set up sign-in, or uncheck this, to close it.',
    },
    'remote_admin_on_title': {
        zh: '已启用免登录远程管理。',
        en: 'remote admin is enabled without sign-in.',
    },
    'remote_admin_pending_title': {
        zh: '保存后将启用免登录远程管理。',
        en: 'remote admin will be enabled without sign-in when you save.',
    },
    'remote_admin_limited_note': {
        zh: '除非设置登录，否则管理操作仅限于本机。',
        en: 'admin actions are limited to this machine unless sign-in is set up.',
    },
    'remote_admin_sign_in_note': {
        zh: '登录开启时忽略；关闭登录后再次生效。',
        en: 'ignored while sign-in is on; it applies again if sign-in is turned off.',
    },
    'remote_admin_off_box_warning': {
        zh: '您在另一台设备上：保存将结束您在此处的管理访问权限。',
        en: 'you are on another device: saving this ends your admin access from here.',
    },
    'disable_login_failed': {
        zh: '禁用登录失败——请查看服务器日志。',
        en: 'failed to disable login — see server logs.',
    },
    'enable_login_failed': {
        zh: '启用登录失败',
        en: 'failed to enable login',
    },
    'enable_login_failed_reach': {
        zh: '启用登录失败——无法连接服务器。',
        en: 'failed to enable login — could not reach server.',
    },
    'add_user_first': {
        zh: '请先添加具有管理员密码的用户（用户 → 管理用户）',
        en: 'Add a user with an admin password first (Users → manage users)',
    },
    'users_title': {
        zh: '用户',
        en: 'Users',
    },
    'users_lockdown_desc': {
        zh: '当前未启用登录。请设置管理员用户名和密码——完成后应用将要求登录。',
        en: 'Auth is currently disabled. Set an admin username and password — the app will require login after this.',
    },
    'users_username': {
        zh: '用户名',
        en: 'Username',
    },
    'users_password': {
        zh: '密码',
        en: 'Password',
    },
    'users_role': {
        zh: '角色',
        en: 'Role',
    },
    'users_secure_add': {
        zh: '安全设置并添加用户',
        en: 'Secure & add user',
    },
    'users_cancel': {
        zh: '取消',
        en: 'Cancel',
    },
    'users_confirm': {
        zh: '确认',
        en: 'confirm',
    },
    'users_delete': {
        zh: '删除',
        en: 'delete',
    },
    'users_unlock': {
        zh: '解锁',
        en: 'unlock',
    },
    'users_disabled_state': {
        zh: '已禁用',
        en: 'disabled',
    },
    'users_locked_state': {
        zh: '已锁定',
        en: 'locked',
    },
    'cert_ready_listener_not_started': {
        zh: '证书已就绪，但 HTTPS 监听器尚未启动。重启服务器以开始提供 HTTPS 服务。',
        en: 'certificate ready, but the https listener has not started yet. restart the server to begin serving https.',
    },
    'https_listener_failed': {
        zh: 'HTTPS 监听器启动失败，可能是端口已被占用。请查看服务器日志。',
        en: 'the https listener failed to start, possibly because its port is already in use. check the server logs.',
    },
    'cert_must_match_address': {
        zh: '必须与您在另一台设备上输入的地址一致才能访问此服务器。',
        en: 'must match the address you type on the other device to reach this server.',
    },
    'cert_must_match_name': {
        zh: '必须与您在另一台设备上输入的名称一致才能访问此服务器。',
        en: 'must match the name you type on the other device to reach this server.',
    },
    'ca_install_each_device': {
        zh: '在每台连接的设备上安装它（Firefox 有自己的商店）。',
        en: 'install it on each device that connects (firefox has its own store).',
    },
    'public_suffix_warning': {
        zh: '“$1”是互联网域名结尾，不是计算机名称，因此不能使用。请使用类似 $1.lan 的名称，或您的设备用于访问此计算机的名称。',
        en: '"$1" is an internet domain ending, not a computer\'s name, so it can\'t be used. use something like $1.lan, or the name your devices use to reach this computer.',
    },
    'exposure_needs_certificate': {
        zh: '需要先有证书。',
        en: 'needs a certificate first.',
    },
    'exposure_needs_restart': {
        zh: '请先重启服务器。',
        en: 'restart the server first.',
    },
    'tls_state_failed': {
        zh: '获取 /api/tls/state 失败',
        en: 'GET /api/tls/state failed',
    },
    'ip_address': {
        zh: 'IP 地址',
        en: 'ip address',
    },
    'hostname_or_domain': {
        zh: '主机名或域名',
        en: 'hostname or domain name',
    },
    'current_certificate': {
        zh: '当前证书：',
        en: 'current certificate:',
    },
    'regenerate_restore_ca': {
        zh: '重新生成以恢复 CA 下载。',
        en: 'regenerate to restore the ca download.',
    },
    'ca_not_trusted_note': {
        zh: '在安装 CA 之前，浏览器不会信任此证书。请在下方安装以消除警告——无论如何，流媒体传输现在已可正常使用。',
        en: 'browsers will not trust this certificate until the ca is installed. install it below to remove the warning — streaming already works either way.',
    },
    'cert_name_resolve_note': {
        zh: '此名称必须在每台连接的机器上可解析——请添加到它们的 hosts 文件或您的本地 DNS。',
        en: 'this name must resolve on every machine that connects — add it to their hosts file or your local dns.',
    },
    'server_accepts_connections': {
        zh: '此服务器接受发送到以下地址的连接',
        en: 'this server accepts connections addressed to',
    },
    'server_accepts_connections_now': {
        zh: '此服务器现在也接受发送到以下地址的连接',
        en: 'this server now also accepts connections addressed to',
    },
    'enter_addr_first': {
        zh: '请先输入 IP 地址或主机名。',
        en: 'enter an ip address or hostname first.',
    },
    'cert_generated_restart': {
        zh: '证书已生成。重启服务器以提供新证书。',
        en: 'certificate generated. restart the server so it serves the new certificate.',
    },
    'cert_generated_https': {
        zh: '证书已生成。重启服务器以开始提供 HTTPS 服务。',
        en: 'certificate generated. restart the server to start serving https.',
    },
    'cert_generated': {
        zh: '证书已生成。',
        en: 'certificate generated.',
    },
    'could_not_reach_server': {
        zh: '无法连接服务器。',
        en: 'could not reach the server.',
    },
    'revoke_cert_q': {
        zh: '吊销本地 HTTPS 证书？',
        en: 'revoke the local https certificate?',
    },
    'revoke_cert_warn': {
        zh: '这将同时删除证书和 CA。每台安装了 CA 以信任此服务器的设备都会再次看到警告，且来自其他机器的流会停止，直到您生成新证书并让它们安装新的 CA。正在运行的服务器在重启前会继续用内存中的旧材料响应 HTTPS。继续？',
        en: 'this deletes the certificate AND the ca. every device that installed the ca to trust this server will see a warning again, and streaming from other machines stops until you generate a new certificate and they install the new ca. the running server keeps answering https with the old material from memory until it restarts. continue?',
    },
    'cert_ca_revoked': {
        zh: '证书和 CA 已吊销。重启服务器以完全停止 HTTPS 监听器。',
        en: 'certificate and ca revoked. restart the server to fully stop the https listener.',
    },
    'ca_cert_downloaded': {
        zh: 'CA 证书已下载。',
        en: 'ca certificate downloaded.',
    },
    'redirect_https': {
        zh: '重定向到 HTTPS',
        en: 'redirect to https',
    },
    'redirect_https_note': {
        zh: '访问明文 HTTP 地址的其他机器将被发送到 HTTPS 地址。',
        en: 'other machines that open the plain http address are sent to the https address instead.',
    },
    'plain_http_stop_note': {
        zh: '明文 HTTP 将不再响应其他机器。',
        en: 'plain http will stop answering other machines.',
    },
    'exposure_effect_note': {
        zh: '此更改对新连接立即生效。已运行的流不受影响。',
        en: 'this takes effect immediately for new connections. streams already running are not affected.',
    },
    'exposure_restart_first': {
        zh: '请先重启服务器——此模式尚无可应用的 HTTPS 监听器。',
        en: 'restart the server first — this mode has no https listener to apply to yet.',
    },
    'exposure_generate_first': {
        zh: '请先生成证书——此模式尚无可应用的 HTTPS 监听器。',
        en: 'generate a certificate first — this mode has no https listener to apply to.',
    },
    'not_supported_yet': {
        zh: '此服务器尚不支持保存此设置。',
        en: 'this server does not support saving this setting yet.',
    },
    'exposure_updated': {
        zh: '明文 HTTP 暴露设置已更新。',
        en: 'plain-http exposure updated.',
    },
    'allowed_embedders': {
        zh: '允许的嵌入来源',
        en: 'Allowed embedders',
    },
    'embed_https_proxy_note': {
        zh: '请先通过反向代理以 HTTPS 提供此应用。',
        en: 'serve this app over https from your reverse proxy first.',
    },
    'embed_https_setup_note': {
        zh: '请先设置本地 HTTPS 或反向代理。',
        en: 'set up local https or a reverse proxy first.',
    },
    'none_added': {
        zh: '未添加',
        en: 'none added',
    },
    'embed_read_failed': {
        zh: '无法读取列表——请查看服务器日志。',
        en: 'could not read the list — see server logs.',
    },
    'revoke_embed_q': {
        zh: '吊销嵌入权限？',
        en: 'revoke embedding permission?',
    },
    'revoke_embed_warn': {
        zh: '它当前显示的任何内容都将立即停止工作。它可以再次请求。',
        en: 'Anything it is currently showing will stop working immediately. It can ask again.',
    },
    'revoke_embed_origin_warn': {
        zh: '“$1”将无法再在框架中显示此应用。',
        en: '"$1" will no longer be able to display this app in a frame.',
    },
    'embedder_address': {
        zh: '嵌入来源地址',
        en: 'embedder address',
    },
    'embedder_port': {
        zh: '嵌入来源端口',
        en: 'embedder port',
    },
    'embedder_scheme': {
        zh: '嵌入来源协议',
        en: 'embedder scheme',
    },
    'embed_both_schemes_note': {
        zh: 'http 使用 80 端口，https 使用 443 端口；如需其他端口，请分别添加每种协议。',
        en: 'uses 80 for http and 443 for https; for other ports, add each scheme separately.',
    },
    'summary_http_warn': {
        zh: '更改 HTTP 端口将重启服务器。此页面将自动在新端口重新加载——应用并未崩溃。',
        en: 'Changing the HTTP port will restart the server. This page will reload on the new port automatically — the app is not crashing.',
    },
    'summary_https_warn': {
        zh: '更改 HTTPS 端口将重启服务器；所有活动流将断开。',
        en: 'Changing the HTTPS port will restart the server; any active streams will drop.',
    },
    'admin_unreachable_note': {
        zh: '管理员更改仅限于运行服务器的这台机器。',
        en: 'admin changes are limited to the machine running the server.',
    },
    'admin_only_note': {
        zh: '只有管理员才能更改这些设置。',
        en: 'only an admin can change these settings.',
    },
    'service_install_not_applicable_container': {
        zh: '服务安装不适用——此实例在容器中运行。',
        en: 'service install not applicable — this instance runs in a container.',
    },
    'app_updates_not_applicable_container': {
        zh: '应用更新不适用——此实例在容器中运行；拉取新镜像即可更新。',
        en: 'app updates not applicable — this instance runs in a container; pull a newer image to update.',
    },
    'dependency_updates_not_applicable_container': {
        zh: '依赖更新不适用——此实例在容器中运行；拉取新镜像即可更新。',
        en: 'dependency updates not applicable — this instance runs in a container; pull a newer image to update.',
    },
    'local_https_not_applicable_container': {
        zh: '本地 HTTPS 不适用于容器。请通过容器前的反向代理提供 HTTPS——这是为镜像添加 HTTPS 的唯一受支持方式。',
        en: "local HTTPS doesn't apply in a container. serve HTTPS from a reverse proxy in front of the container — that is the only supported way to add HTTPS to the image.",
    },
};

let currentLang: Language = 'en';

// Resolve the stored/system language without touching the DOM. Runs at module
// load so that top-level `const X = t('…')` in other modules (card notes,
// titles, staged-field labels) already resolves in the user's language instead
// of the `en` fallback — `initI18n()` is called later, from onload, and by
// then those constants are already frozen.
function readStoredLanguage(): Language {
    try {
        const saved = localStorage.getItem('language');
        if (saved === 'zh' || saved === 'en') return saved;
        const sysLang = navigator.language.toLowerCase();
        return sysLang.startsWith('zh') ? 'zh' : 'en';
    } catch {
        return 'en';
    }
}
currentLang = readStoredLanguage();

export function initI18n(): void {
    // Check localStorage first
    currentLang = readStoredLanguage();
    document.documentElement.lang = currentLang;
    // Keep the browser tab title in sync with the UI language (index.html
    // ships the English default).
    document.title = t('app.title');
}

export function t(key: string): string {
    return translations[key]?.[currentLang] || key;
}

export function getLanguage(): Language {
    return currentLang;
}

export function setLanguage(lang: Language): void {
    currentLang = lang;
    localStorage.setItem('language', lang);
    document.documentElement.lang = lang;
    // Reload to apply translations
    window.location.reload();
}

export function createLanguageToggle(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'language-toggle';
    btn.title = 'Switch language / 切换语言';
    btn.style.cssText = `
        position: fixed; top: 12px; right: 100px;
        width: 36px; height: 36px; border-radius: 50%;
        background: var(--device-list-default-color);
        border: 1px solid var(--device-border-color);
        cursor: pointer; z-index: 100;
        display: flex; align-items: center; justify-content: center;
        font-size: 13px; font-weight: 600; color: var(--text-color, #333);
    `;
    btn.innerText = currentLang === 'zh' ? '中' : 'EN';
    btn.addEventListener('mouseenter', () => {
        btn.style.background = 'var(--device-list-hover-color)';
    });
    btn.addEventListener('mouseleave', () => {
        btn.style.background = 'var(--device-list-default-color)';
    });
    btn.addEventListener('click', () => {
        const newLang = currentLang === 'zh' ? 'en' : 'zh';
        localStorage.setItem('language', newLang);
        window.location.reload();
    });
    return btn;
}

/**
 * Translate server-side error texts that leak to the UI. The server protocol
 * keeps English strings (they also land in its own logs); only display is
 * localized. Anything unrecognised passes through unchanged.
 */
export function localizeServerError(error: string): string {
    if (error === OPERATOR_REFUSAL_ERROR) return t('admin_limited_title');
    if (error === REMOTE_ADMIN_FORCED_MESSAGE) return t('remote_admin_forced_message');
    return error;
}
