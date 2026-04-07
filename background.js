/**
 * Service worker (MV3): entry mínimo. Lógica en ./background/
 */
import { installApexTraceAlarmListener } from './background/apexTestTraceAlarms.js';
import { installCookieCacheInvalidation, installMessageHandlers } from './background/messageHandlers.js';

installMessageHandlers();
installCookieCacheInvalidation();
installApexTraceAlarmListener();
