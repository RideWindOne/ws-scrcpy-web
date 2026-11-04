import { describe, expect, it } from 'vitest';
import {
    NOTIFICATION_COMMAND_NOREDACT,
    parseDeviceNotifications,
    parsePackageList,
    isMessagingPackage,
} from '../deviceNotifications';

const SAMPLE_DUMP = `
Notification List:
  NotificationRecord(0x01) userId=0
    pkg=com.tencent.mm
    key=0|com.tencent.mm|1|1001|1001
    postTime=1730000000123
    extras=Bundle[{android.title=String (微信), android.text=String (你好), android.category=String (msg)}]
  NotificationRecord(0x02) userId=0
    pkg=com.android.systemui
    key=0|com.android.systemui|1|1|1
    extras=Bundle[{android.title=String (电池), android.text=String (已充满)}]
  NotificationRecord(0x03) userId=0
    pkg=com.clipboard.provider
    key=0|com.clipboard.provider|1|2|2
    extras=Bundle[{android.title=String (剪贴板), android.text=String (已复制)}]
  NotificationRecord(0x04) userId=0
    pkg=com.tencent.mobileqq
    key=0|com.tencent.mobileqq|1|3|3
    extras=Bundle[{android.title=String (QQ), android.bigText=String (群消息 3 条), android.category=String (msg)}]
  NotificationRecord(0x05) userId=0
    pkg=com.example.progress
    key=0|com.example.progress|1|4|4
    extras=Bundle[{android.title=String (null), android.progress=Integer (50)}]
`;

describe('parseDeviceNotifications', () => {
    it('parses pkg/key/title/text/category/time from NotificationRecord blocks', () => {
        const items = parseDeviceNotifications(SAMPLE_DUMP);
        expect(items).toHaveLength(3); // systemui+wechat+qq; clipboard + progress filtered
        const wechat = items.find((n) => n.package === 'com.tencent.mm');
        expect(wechat).toBeDefined();
        expect(wechat?.title).toBe('微信');
        expect(wechat?.text).toBe('你好');
        expect(wechat?.category).toBe('msg');
        expect(wechat?.time).toBe(1730000000123);
        expect(wechat?.key).toContain('com.tencent.mm');
        const qq = items.find((n) => n.package === 'com.tencent.mobileqq');
        expect(qq?.text).toBe('群消息 3 条');
    });

    it('filters by package list', () => {
        const items = parseDeviceNotifications(SAMPLE_DUMP, ['com.tencent.mobileqq']);
        expect(items).toHaveLength(1);
        expect(items[0]?.package).toBe('com.tencent.mobileqq');
    });

    it('drops progress-only notifications (no readable text)', () => {
        const items = parseDeviceNotifications(SAMPLE_DUMP);
        expect(items.some((n) => n.package === 'com.example.progress')).toBe(false);
    });

    it('parses line-form extras without Bundle', () => {
        const lineForm = `
Notification List:
  NotificationRecord(0x99)
    pkg=com.android.mms
    key=0|com.android.mms|1|9|9
    android.title=String (短信)
    android.text=String (今晚见)
`;
        const items = parseDeviceNotifications(lineForm);
        expect(items).toHaveLength(1);
        expect(items[0]?.title).toBe('短信');
        expect(items[0]?.text).toBe('今晚见');
    });
});

describe('parsePackageList', () => {
    it('extracts package names from pm list output', () => {
        const output = 'package:com.tencent.mm\npackage:com.android.mms\n\nerror: none\n';
        expect(parsePackageList(output)).toEqual(['com.tencent.mm', 'com.android.mms']);
    });
});

describe('isMessagingPackage', () => {
    it('recognises category msg/email/call', () => {
        expect(isMessagingPackage('com.any.app', 'msg')).toBe(true);
        expect(isMessagingPackage('com.any.app', 'email')).toBe(true);
        expect(isMessagingPackage('com.any.app', 'call')).toBe(true);
        expect(isMessagingPackage('com.any.app', 'reminder')).toBe(false);
    });
    it('recognises known messaging packages', () => {
        expect(isMessagingPackage('com.tencent.mm')).toBe(true);
        expect(isMessagingPackage('com.tencent.mobileqq')).toBe(true);
        expect(isMessagingPackage('com.android.mms')).toBe(true);
        expect(isMessagingPackage('com.example.launcher')).toBe(false);
    });
});

describe('notification command', () => {
    it('uses --noredact and greps only the fields we need', () => {
        expect(NOTIFICATION_COMMAND_NOREDACT).toContain('dumpsys notification --noredact');
        expect(NOTIFICATION_COMMAND_NOREDACT).toContain('NotificationRecord\\(');
        expect(NOTIFICATION_COMMAND_NOREDACT).toContain('android\\.text');
    });
});
