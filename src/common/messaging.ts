/**
 * Shared (front-end + server) helpers for deciding whether a notification
 * belongs to a messaging/communication app, so the UI can offer a Reply
 * entry. Kept dependency-free so both sides can import it.
 */

/** Packages treated as instant-messaging / communication apps. When a
 * notification's category is unavailable, this list decides whether the UI
 * shows a Reply button. */
export const MESSAGING_PACKAGE_MARKERS: readonly string[] = [
    'com.tencent.mm', // WeChat
    'com.tencent.mobileqq', // QQ
    'com.android.mms', // AOSP SMS
    'com.android.dialer', // Phone
    'com.google.android.apps.messaging', // Google Messages
    'com.google.android.dialer',
    'com.whatsapp',
    'com.facebook.orca', // Messenger
    'com.facebook.katana', // Facebook
    'com.twitter.android',
    'org.telegram.messenger',
    'com.slack',
    'com.discord',
    'com.immomo.momo',
    'com.sina.weibo',
    'com.tencent.wework',
    'com.alibaba.android.rimet', // DingTalk
    'com.ss.android.lark', // Feishu
    'com.xingin.xhs', // Xiaohongshu
];

export function isMessagingPackage(packageName: string, category?: string): boolean {
    if (category === 'msg' || category === 'email' || category === 'call') return true;
    return MESSAGING_PACKAGE_MARKERS.some((p) => packageName === p || packageName.startsWith(p + '.'));
}
