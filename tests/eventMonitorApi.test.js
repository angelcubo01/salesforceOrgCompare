import { describe, expect, it } from 'vitest';
import {
  applyReplayExtension,
  buildChannelPath,
  buildCometdUrl,
  EVENT_CHANNEL_TYPES
} from '../shared/eventMonitorApi.js';

describe('eventMonitorApi', () => {
  it('buildChannelPath usa prefijos por tipo', () => {
    expect(buildChannelPath('platformEvent', 'MyEvent__e')).toBe('/event/MyEvent__e');
    expect(buildChannelPath('changeEvent', 'AccountChangeEvent')).toBe('/data/AccountChangeEvent');
    expect(buildChannelPath('customChannel', '', '/event/Custom__chn')).toBe('/event/Custom__chn');
  });

  it('buildCometdUrl normaliza versión', () => {
    expect(buildCometdUrl('https://x.my.salesforce.com', 'v59.0')).toBe(
      'https://x.my.salesforce.com/cometd/59.0'
    );
  });

  it('applyReplayExtension añade ext.replay en subscribe', () => {
    const msg = applyReplayExtension(
      { channel: '/meta/subscribe', clientId: '1', subscription: '/event/Foo__e' },
      '/event/Foo__e',
      -1
    );
    expect(msg.ext.replay['/event/Foo__e']).toBe(-1);
  });

  it('EVENT_CHANNEL_TYPES define cinco tipos', () => {
    expect(EVENT_CHANNEL_TYPES.length).toBe(5);
  });
});
